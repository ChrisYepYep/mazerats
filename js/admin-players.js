/* ===========================================================
   Maze Rats — the Players panel in /warren (29 Sept 2026)

   Everybody who has signed in with Discord, and the nicknames the boards
   show them by. The owner asked for every nickname to be listed in the
   Warren beside the Discord account that holds it, with every Discord user
   who has signed in, and for the admins to be able to add, change and
   remove nicknames; this is that, plus what goes with it.

     THE STRIP    How many players, how many have a nickname, how many
                  are locked; when the list was read; Export CSV; Refresh.

     THE FILTERS  All / has a nickname / no nickname / locked / not yet
                  asked; a search (nickname, Discord name, @username, the
                  start of a Discord id); and the order (last signed in,
                  first signed in, name, nickname).

     THE LIST     One row per player: picture, the name the boards show,
                  the nickname, their Discord display name and @username,
                  the Discord id with a Copy, first and last sign-in, and
                  what they have played (daily-game days and points, their
                  Fallin' Furni best, Missing Pieces sent). A hundred at a
                  time, with Previous / Next.

     THE DETAIL   Opened under a row. Everything above in full, the
                  activity broken down by game, the last ten nickname
                  changes (who made each), and the actions:
                    - set, change or remove the nickname — the ADMIN
                      OVERRIDE: the player's own rules and uniqueness, their
                      board rows renamed, but not their five a day;
                    - lock / unlock it: while locked the player cannot
                      change it themselves, and their Profile says to ask;
                    - show the first-sign-in "Choose a nickname?" again;
                    - ALLOW or REJECT the nickname (29 Sept 2026, below);
                    - (owner only) forget the player — player-forget.js's
                      dry run first, its counts behind the confirm.

     FLAGGED      (29 Sept 2026) The word filter no longer refuses a
                  nickname; it flags it (see FLAGGED in
                  netlify/functions/player-nick.js for the owner's
                  decision). A flagged row wears a "Flagged: filter word
                  'x'" chip naming the word that matched, so the admin can
                  judge; the filter track has a Flagged button with its
                  count; and the nav badge turns from the quiet player count
                  into the filled amber one with the flagged count, the way
                  the Errors badge asks for attention. In the detail, Allow
                  keeps the name and takes the flag off; Reject keeps the
                  name for now but asks the player, on their next visit, to
                  choose another (js/account.js), and Reject is there for
                  any nickname, for what the filter missed. Neither locks,
                  clears or renames anything.

     LOOK UP      (owner only, under the list) Forget somebody who is not
                  in it: scores on a board but no players row, because
                  their sign-in's profile write failed or they were
                  forgotten while a session lived on. This is the old
                  Admins-tab "Forget a player" section, moved here.

   Owners and admins write; a view-only account reads and is shown none of
   the buttons (the server refuses regardless) and never a Discord id — the
   server sends it a stand-in `ref` instead (see players-admin.js).

   Every name here came from Discord or from a player typing, and is
   escaped on the way in (escapeHtml below) or set as text. The CSV guards
   against spreadsheet formulas the same way.

   A file of its own, like js/admin-errors.js, which it follows closely:
   the same session token (the localStorage key admin.js writes), Api's
   authenticated calls, and window.AdminLockOut / AdminRole / AdminConfirm
   lent by admin.js. admin.js calls window.AdminPlayers.reset() on log out
   and a change of account, clearPrivate() on a lock-out, and roleChanged()
   once it knows who is signed in.

     MODERATION   (29 Sept 2026) Bans and cool-downs, on the Discord account
                  or on the network the player last signed in from (kept
                  on the server as a hash — the address itself never comes
                  here). A row wears "Banned" or "Cooling down until …";
                  the filter track has Banned; the detail has a Moderation
                  block: what is in force, with Lift and Change, or the
                  controls to ban. The wording and the choices are
                  window.AdminBanKit, just below, which the Bans tab in
                  admin.js uses as well.
   =========================================================== */

/* ===========================================================
   window.AdminBanKit — the ban choices, in one place (29 Sept 2026)

   The owner's two levels, in his words: "soft" is "everything but
   reading" (they can browse, but can't sign in, play, be on a board, set a
   nickname, or send a message or a Missing Piece) and "full" is "the whole
   site" (a banned screen on every page but the privacy policy). A
   cool-down is the same ban with an end: 1 hour, 24 hours, 7 days, or a
   date and time. Two tabs ban people — this one, from a player's row, and
   the Bans tab (js/admin.js), for addresses and for anyone — and the
   choices, the words for them and the sentence behind the Are You Sure?
   are the same in both because they are this one copy. Two copies would
   drift, and the one place a ban's wording must not drift is the summary
   an admin says Yes to.

   Its own little closure ahead of the Players panel's, so it exists even
   if that panel's guard stops early. admin.js only reaches for it when a
   ban list is drawn, which is after every script has loaded.

   Everything it returns as markup is escaped here; the state objects it
   works on are plain { target, level, length, custom, reason } that the
   caller keeps (in a Map, across redraws) and it mutates as buttons are
   pressed.
   =========================================================== */
(function () {
    "use strict";

    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const LEVELS = [["soft", "Everything but reading"], ["full", "Whole site"]];
    const LENGTHS = [["1h", "1 hour"], ["24h", "24 hours"], ["7d", "7 days"], ["perm", "Permanent"], ["custom", "Custom"]];
    // Change adds "keep": a new level or reason should not have to restate the end.
    const CHANGE_LENGTHS = [["keep", "Keep"]].concat(LENGTHS);
    const TARGETS = [["account", "This account"], ["net", "This account's network"], ["both", "Both"]];
    const DURATION_MS = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3 };
    const DURATION_WORDS = { "1h": "for 1 hour", "24h": "for 24 hours", "7d": "for 7 days" };
    const REASON_MAX = 200;
    const NO_NET = "No network recorded yet — they need to visit while signed in.";

    function levelLong(level) {
        if (level === "full") return "Blocked from the whole site";
        if (level === "soft") return "Blocked from playing & signing in";
        /* A ban from before levels existed: it only ever stopped the
           contact form and Missing Pieces, and the server keeps those
           rows as they were. */
        return "Blocked from sending messages (older ban)";
    }
    function levelShort(level) {
        return level === "full" ? "Whole site" : level === "soft" ? "Everything but reading" : "Messages only";
    }
    function levelMeans(level) {
        return level === "full"
            ? "Permanent: every page shows them a Maintenance page, with nothing saying it is a ban. A cool-down: the same, with a pop-up giving the time left and the reason. The privacy policy stays open to them."
            : "They can still read the site, but can't sign in, play, appear on the boards, set a nickname, or send a message or a Missing Piece. Each of those tells them the time left and the reason.";
    }

    // ---- times. UTC on screen, as everywhere in the Warren.
    function fmtUtc(t) {
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }
    function fmtShort(t) {
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }
    function leftText(msLeft) {
        const m = Math.max(1, Math.round(msLeft / 60000));
        if (m < 60) return m + " min left";
        const h = Math.floor(m / 60);
        if (h < 48) return h + " h" + (m % 60 && h < 10 ? " " + (m % 60) + " min" : "") + " left";
        return Math.round(h / 24) + " days left";
    }
    // The value a datetime-local box takes, for a UTC moment.
    function localBoxValue(t) { return new Date(t).toISOString().slice(0, 16); }

    /* One shape for every ban, whatever wrote it. The old contact-form bans
       are { id, ip, net, reason, createdAt, createdBy } with no kind or
       level; the new ones are { kind, value, name, level, until, reason,
       by, at, active, id } (see netlify/functions/bans.js). A view-only
       account is sent no addresses at all, so `value` can be empty. */
    function normalise(b) {
        if (!b || typeof b !== "object") return null;
        const kinds = ["player", "ip", "net", "nethash"];
        const kind = kinds.includes(b.kind) ? b.kind : (b.ip ? "ip" : b.net ? "net" : "ip");
        const value = typeof b.value === "string" && b.value ? b.value
            : kind === "net" ? String(b.net || b.ip || "") : kind === "player" || kind === "nethash" ? "" : String(b.ip || b.net || "");
        const until = b.until ? Date.parse(b.until) : NaN;
        return {
            raw: b,
            id: String(b.id || ""),
            kind,
            value,
            net: typeof b.net === "string" ? b.net : "",
            name: typeof b.name === "string" ? b.name : "",
            // Which player an account or network ban is about, when the list says.
            playerId: String(b.playerId || (kind === "player" ? value : "") || ""),
            level: b.level === "soft" || b.level === "full" ? b.level : "",
            until: Number.isFinite(until) ? until : null,
            reason: typeof b.reason === "string" ? b.reason : "",
            by: String(b.by || b.createdBy || ""),
            at: Date.parse(b.at || b.createdAt || "") || NaN,
            active: typeof b.active === "boolean" ? b.active : null
        };
    }
    // The server's `active` is believed, except that a cool-down whose end
    // has passed since the list was read has ended, whatever it said then.
    function isActive(n, now) {
        if (!n) return false;
        if (n.until != null && n.until <= now) return false;
        return n.active !== false;
    }
    function untilText(n, now) {
        if (n.until == null) return "Permanent";
        if (n.until > now) return `Until ${fmtUtc(n.until)} · ${leftText(n.until - now)}`;
        return `Ended ${fmtUtc(n.until)}`;
    }
    function shortId(id) {
        const s = String(id || "");
        return s.length > 8 ? s.slice(0, 6) + "…" : s;
    }
    // Who or what a ban is on, as text (the caller escapes).
    function targetText(n) {
        if (n.kind === "player") return (n.name || "A player") + (n.value ? " (ID " + shortId(n.value) + ")" : "");
        if (n.kind === "nethash") return "Network of " + (n.name || "a player");
        if (!n.value) return n.kind === "net" ? "A network (address hidden)" : "An address (hidden)";
        return n.value;
    }
    function kindText(kind) {
        return kind === "player" ? "Account" : kind === "nethash" ? "Player's network" : kind === "net" ? "Network (/64)" : "Address";
    }

    /* The server's subscriberOf (netlify/functions/_net.js), copied: the
       /64 an IPv6 address belongs to, or an IPv4 address itself. Only used
       to say whether a message's sender is already caught by a network ban
       — the server decides for real. */
    function subscriberOf(ip) {
        const s = String(ip || "").trim().toLowerCase().replace(/%.*$/, "");
        if (!s.includes(":")) return s;
        const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
        if (mapped) return mapped[1];
        const halves = s.split("::");
        const head = halves[0] ? halves[0].split(":") : [];
        const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
        const width = list => list.length + (list.length && list[list.length - 1].includes(".") ? 1 : 0);
        const groups = halves.length > 1
            ? [...head, ...Array(Math.max(0, 8 - width(head) - width(tail))).fill("0"), ...tail]
            : head;
        return groups.slice(0, 4).map(g => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
    }
    // An active address or network ban catches this address.
    function catchesIp(n, ip, now) {
        if (!ip || !isActive(n, now) || (n.kind !== "ip" && n.kind !== "net")) return false;
        const net = subscriberOf(ip);
        return n.value === ip || n.raw.ip === ip || n.net === net || (n.kind === "net" && subscriberOf(n.value.replace(/\/64$/, "")) === net);
    }
    /* What an admin types as a target: an IPv4 address, an IPv6 address,
       or an IPv6 /64. Loose on purpose — the server checks properly — but
       enough to catch a Discord ID pasted into the wrong box. */
    function looksLikeAddress(v) {
        const s = String(v || "").trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s.split(".").every(x => Number(x) <= 255);
        return /^[0-9a-f:]+(\/64)?$/i.test(s) && s.includes(":") && s.replace(/\/64$/, "").length >= 2;
    }

    // ---- the form

    function segHtml(name, options, current, label, off) {
        return `<div class="ctl-seg bn-seg" role="group" aria-label="${esc(label)}" data-bn-seg="${esc(name)}">${options.map(([v, l]) =>
            `<button type="button" class="btn-enter-mini${v === current ? " active" : ""}" data-bn-val="${esc(v)}" aria-pressed="${v === current}"${off && off[v] ? ` disabled title="${esc(off[v])}"` : ""}>${esc(l)}</button>`).join("")}</div>`;
    }

    function fresh(extra) {
        return Object.assign({ target: "account", level: "soft", length: "24h", custom: "", reason: "" }, extra || {});
    }

    /* opts: { now, change (adds Keep), ended (a ban that has run out: Keep
       would keep it ended, so it is not offered), targets: { net: bool } or null,
       uid (unique within the page, for label ids) }. */
    function endedAt(b, now) {
        const t = b && (typeof b.until === "number" ? b.until : Date.parse(b.until || ""));
        return Number.isFinite(t) && t <= now;
    }

    function formHtml(state, opts) {
        const o = opts || {};
        const uid = esc(o.uid || "bn");
        const now = Number.isFinite(o.now) ? o.now : Date.now();
        let targetPart = "";
        if (o.targets) {
            const off = o.targets.net ? null : { net: NO_NET, both: NO_NET };
            targetPart = `
                <div class="bn-field">
                    <span class="ctl-label">Target</span>
                    ${segHtml("target", TARGETS, state.target, "What to ban", off)}
                    ${o.targets.net ? "" : `<p class="admin-hint bn-note">${esc(NO_NET)}</p>`}
                </div>`;
        }
        const custom = state.length === "custom";
        return `
            <div class="bn-form" data-bn-form>
                ${targetPart}
                <div class="bn-field">
                    <span class="ctl-label">Level</span>
                    ${segHtml("level", LEVELS, state.level, "How much of the site")}
                    <p class="admin-hint bn-note" data-bn-means>${esc(levelMeans(state.level))}</p>
                </div>
                <div class="bn-field">
                    <span class="ctl-label">Length</span>
                    ${segHtml("length", o.change && !o.ended ? CHANGE_LENGTHS : LENGTHS, state.length, "How long")}
                    <label class="bn-custom" data-bn-custom${custom ? "" : " hidden"}>
                        <span class="ctl-label">Ends (UTC)</span>
                        <input type="datetime-local" class="ctl-input" data-bn="custom" step="60" min="${esc(localBoxValue(now))}" value="${esc(state.custom)}">
                    </label>
                </div>
                <div class="bn-field">
                    <label class="ctl-label" for="${uid}-reason">Reason <span class="bn-optional">optional</span></label>
                    <input type="text" class="ctl-input" id="${uid}-reason" data-bn="reason" maxlength="${REASON_MAX}" autocomplete="off" placeholder="Shown to the banned player only (not on a permanent whole-site ban), never to others on their network" value="${esc(state.reason)}">
                </div>
            </div>`;
    }

    /* Makes a drawn form change `state`. Everything is redrawn in place
       (the pressed button, the level's sentence, the custom box) rather
       than by the caller, so what is being typed elsewhere in the panel
       survives a click here. onChange, if given, runs after each. */
    function wire(root, state, onChange, nowFn) {
        if (!root) return;
        root.addEventListener("click", e => {
            const b = e.target.closest("[data-bn-val]");
            if (!b || b.disabled || !root.contains(b)) return;
            const seg = b.closest("[data-bn-seg]");
            const key = seg.dataset.bnSeg;
            state[key] = b.dataset.bnVal;
            seg.querySelectorAll("[data-bn-val]").forEach(x => {
                const on = x === b;
                x.classList.toggle("active", on);
                x.setAttribute("aria-pressed", String(on));
            });
            if (key === "level") {
                const means = root.querySelector("[data-bn-means]");
                if (means) means.textContent = levelMeans(state.level);
            }
            if (key === "length") {
                const box = root.querySelector("[data-bn-custom]");
                if (box) box.hidden = state.length !== "custom";
                const input = root.querySelector('[data-bn="custom"]');
                if (state.length === "custom" && input) {
                    const now = typeof nowFn === "function" ? nowFn() : Date.now();
                    input.min = localBoxValue(now);
                    if (!input.value) { input.value = localBoxValue(now + 86400e3); state.custom = input.value; }
                    input.focus({ preventScroll: true });
                }
            }
            if (onChange) onChange(key);
        });
        root.addEventListener("input", e => {
            const f = e.target.closest("[data-bn]");
            if (f && root.contains(f)) state[f.dataset.bn] = f.value;
        });
    }

    /* The state, checked. { error } or { level, reason, untilMs, duration,
       custom, keep }: untilMs null is permanent; duration is one of the
       server's own (so its clock sets the end); custom is a date and time
       typed as UTC. */
    function read(state, now) {
        const level = state.level;
        if (level !== "soft" && level !== "full") return { error: "Choose a level." };
        const reason = String(state.reason || "").replace(/\s+/g, " ").trim();
        if (reason.length > REASON_MAX) return { error: `Keep the reason under ${REASON_MAX} characters.` };
        const L = state.length;
        if (L === "keep") return { level, reason, keep: true };
        if (L === "perm") return { level, reason, untilMs: null };
        if (DURATION_MS[L]) return { level, reason, duration: L, untilMs: now + DURATION_MS[L] };
        if (L === "custom") {
            const v = String(state.custom || "");
            const t = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(v) ? Date.parse(v + "Z") : NaN;
            if (!Number.isFinite(t)) return { error: "Pick the date and time it ends (UTC)." };
            if (t <= now + 60e3) return { error: "The end has to be in the future." };
            return { level, reason, custom: true, untilMs: t };
        }
        return { error: "Choose how long." };
    }

    // POST: a preset goes as `duration`, so the server's clock sets the end.
    function postBody(c) {
        const body = { level: c.level, reason: c.reason };
        if (c.duration) body.duration = c.duration;
        else if (c.custom) body.until = new Date(c.untilMs).toISOString();
        return body;
    }
    // PUT has no `duration` in the contract: the end is worked out here.
    function putBody(c, id) {
        const body = { id, level: c.level, reason: c.reason };
        if (!c.keep) body.until = c.untilMs == null ? null : new Date(c.untilMs).toISOString();
        return body;
    }
    function lengthWords(c, current) {
        if (c.keep) return current && current.until != null ? `until ${fmtUtc(current.until)}, as now` : "permanently, as now";
        if (c.untilMs == null) return "permanently";
        if (c.duration) return `${DURATION_WORDS[c.duration]} (until about ${fmtUtc(c.untilMs)})`;
        return `until ${fmtUtc(c.untilMs)}`;
    }
    /* The sentence behind the Are You Sure?, as markup: `who` is plain
       text and escaped here. */
    function summaryHtml(who, c, current) {
        const what = c.level === "full" ? "the whole site" : "everything but reading";
        return `Ban <strong>${esc(who)}</strong> from <strong>${esc(what)}</strong>, <strong>${esc(lengthWords(c, current))}</strong>? ${esc(levelMeans(c.level))}` +
            (c.reason ? ` Reason: <em>${esc(c.reason)}</em>.` : "");
    }
    function changeHtml(who, c, current) {
        const what = c.level === "full" ? "the whole site" : "everything but reading";
        return `Change the ban on <strong>${esc(who)}</strong> to <strong>${esc(what)}</strong>, <strong>${esc(lengthWords(c, current))}</strong>? ${esc(levelMeans(c.level))}` +
            (c.reason ? ` Reason: <em>${esc(c.reason)}</em>.` : " No reason.");
    }
    function liftHtml(n, now) {
        const who = targetText(n);
        if (!isActive(n, now)) return `Remove the ended ban on <strong>${esc(who)}</strong> from the list?`;
        return `Lift the ban on <strong>${esc(who)}</strong> (${esc(levelLong(n.level).toLowerCase())}, ${esc(n.until == null ? "permanent" : "until " + fmtUtc(n.until))})? It takes effect on their next page load.`;
    }
    // The chip a player's row wears: `ban` is players-admin.js's { level, until, kind }.
    function chip(ban, now) {
        if (!ban) return null;
        const until = ban.until ? Date.parse(ban.until) : NaN;
        if (Number.isFinite(until) && until <= now) return null;
        return {
            text: Number.isFinite(until) ? `Cooling down until ${fmtShort(until)}` : "Banned",
            title: `${levelLong(ban.level)}${ban.kind === "nethash" ? " (their network)" : ban.kind === "player" ? " (their account)" : ""}${Number.isFinite(until) ? ", " + leftText(until - now) : ", permanent"}`,
            cooling: Number.isFinite(until)
        };
    }

    window.AdminBanKit = {
        LEVELS, LENGTHS, TARGETS, NO_NET, REASON_MAX,
        levelLong, levelShort, levelMeans, fmtUtc, fmtShort, leftText,
        normalise, isActive, untilText, targetText, kindText, shortId,
        subscriberOf, catchesIp, looksLikeAddress, endedAt,
        fresh, formHtml, wire, read, postBody, putBody, summaryHtml, changeHtml, liftHtml, chip
    };
})();

(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="players"]');
    if (!panel || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const PAGE = 100;
    const STALE_MS = 60 * 1000;
    const NICK_MAX = 20;

    const listEl = panel.querySelector("#players-list");
    const summaryEl = panel.querySelector("#players-summary");
    const filtersEl = panel.querySelector("#players-filters");
    const pagerEl = panel.querySelector("#players-pager");
    const forgetEl = panel.querySelector("#players-forget");
    const updatedEl = panel.querySelector("#players-updated");
    const refreshBtn = panel.querySelector("#players-refresh-btn");
    const exportBtn = panel.querySelector("#players-export-btn");
    const navCount = document.getElementById("players-nav-count");

    // "banned" (29 Sept 2026): banned or cooling down, account or network.
    const FILTERS = [["all", "All"], ["flagged", "Flagged"], ["clash", "Name clash"], ["motto", "Motto flagged"], ["habbo", "Habbo to approve"], ["banned", "Banned"], ["nick", "Has a nickname"], ["nonick", "No nickname"], ["locked", "Locked"], ["unasked", "Not asked yet"]];
    const Kit = window.AdminBanKit;
    const FLAG_REASONS = { profanity: "filter word", reserved: "reserved word" };
    const SORTS = [["seen", "Last signed in"], ["joined", "First signed in"], ["name", "Discord name"], ["nick", "Nickname"]];
    const GAME_NAMES = { guess: "Guess the Maze", odd: "Odd One Out", ratrospect: "Ratrospect (retired)", onewall: "One Wall (retired)" };

    // ------------------------------------------------------------- state

    let filtersBuilt = false;
    let filter = "all";
    let query = "";
    let sort = "seen";
    let skip = 0;

    let players = [];
    let total = 0;
    let counts = {};
    let loadedAt = 0;
    let loadError = null;
    let loadGen = 0;
    let skew = 0;

    let openRef = null;                 // the player whose detail is open
    const details = new Map();          // ref -> the full player, from getPlayer
    const detailErrors = new Map();     // ref -> message, when that read failed
    const nickDrafts = new Map();       // ref -> what is typed in the nickname box
    /* Element ids (for a label's `for`) are numbered, not built from the ref
       (30 Sept 2026): the ref is a Discord ID, and a click's breadcrumb names
       the element by its id. One number per ref, kept for the page's life,
       so a re-render gives the same box the same id. */
    const domIds = new Map();           // ref -> a small number
    const domId = ref => {
        if (!domIds.has(ref)) domIds.set(ref, domIds.size + 1);
        return domIds.get(ref);
    };
    const forgets = new Map();          // ref -> { state, data, error } for the owner's forget
    /* Which detail read is the one to believe (29 Sept 2026). Per ref: the
       number of the latest read started, and of the latest write landed.
       A getPlayer answer that comes back after a newer read started, or
       after a write for that player landed, describes the player as they
       WERE — drawn, it put "Lock nickname" back on a player just locked. */
    const detailReads = new Map();      // ref -> number of the latest read started
    const detailWrites = new Map();     // ref -> number of writes landed
    let busy = false;
    let searchTimer = null;
    /* Which signed-in account an answer belongs to (30 Sept 2026): reset()
       moves it on, and a detail read, a write or a forget still out from
       the account before is then dropped rather than landing in the next
       one's list — a forget used to take one off the new account's counts. */
    let sessionNo = 0;

    /* Moderation (29 Sept 2026; see MODERATION at the top). The row's
       `ban` says only { level, until, kind } — enough for the chip, not
       enough to lift or change it, which needs the ban's own id. So the
       open detail also reads the ban list (the Bans tab's GET) and finds
       this player's bans in it: kind "player" whose value is their Discord
       id, and kind "nethash" whose playerId is. */
    const banDrafts = new Map();        // ref -> the ban form's state, across redraws
    const banEdits = new Map();         // ref -> { id, state } while Change is open
    const modMsgs = new Map();          // ref -> { text, bad }, the Moderation block's own line
    let bansList = null;                // normalised bans, or null before the first read
    let bansAt = 0;
    let bansError = "";
    let bansGen = 0;
    let flashTimer = null;

    // The owner's look-up box (see LOOK UP above).
    let lookGen = 0;
    let lookShown = null;

    // ----------------------------------------------------------- helpers

    function token() {
        // This tab's own session from js/admin.js (3 Oct 2026), not whatever
        // another tab last stored — see window.AdminToken there.
        if (typeof window.AdminToken === "function") return window.AdminToken() || "";
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function has(v) {
        return !(v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)));
    }
    function dash(v) { return has(v) ? String(v) : "—"; }
    function num(n) {
        const x = Number(n);
        return Number.isFinite(x) ? x.toLocaleString("en-GB") : "—";
    }

    function apiReady() { return typeof Api.getPlayers === "function"; }

    function role() {
        try { return typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { return ""; }
    }
    function canWrite() {
        const r = role();
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }
    function isOwner() { return role() === "owner"; }

    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") window.AdminLockOut();
        return true;
    }

    function errText(err) {
        if (err && err.status === 403) return (err.message && err.message !== "Request failed: 403") ? err.message : "This account can't do that";
        return (err && err.message) || "Something went wrong";
    }

    // The player's key in this page: their Discord id, or a viewer's stand-in.
    const refOf = p => String((p && (p.ref || p.id)) || "");
    const shownOf = p => (p && (p.displayName || p.nick || p.name || p.username)) || "Someone";

    // Only a Discord CDN picture goes in an <img>; the server says the same.
    function faceHtml(p, cls) {
        const a = p && typeof p.avatar === "string" && /^https:\/\/cdn\.discordapp\.com\//.test(p.avatar) ? p.avatar : "";
        return a
            ? `<img class="${cls}" src="${escapeHtml(a)}" alt="" aria-hidden="true" loading="lazy" referrerpolicy="no-referrer">`
            : `<span class="${cls}" aria-hidden="true"></span>`;
    }

    // ------------------------------------------------------------- times
    // UTC on screen, as everywhere else in the Warren (see admin-errors.js);
    // the tooltip adds the reader's own time.

    function nowMs() { return Date.now() + skew; }
    function ms(iso) {
        if (iso == null || iso === "") return NaN;
        const t = typeof iso === "number" ? iso : Date.parse(iso);
        return Number.isFinite(t) ? t : NaN;
    }
    function fmtUtc(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "—";
        return new Date(t).toLocaleString("en-GB", {
            timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
        }).replace(",", "") + " UTC";
    }
    function fmtLocal(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "";
        return new Date(t).toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short"
        }) + " (your time)";
    }
    function ago(iso) {
        const t = ms(iso);
        if (!Number.isFinite(t)) return "—";
        const s = Math.round((nowMs() - t) / 1000);
        if (s < 60) return "just now";
        const m = Math.round(s / 60);
        if (m < 60) return m + " min ago";
        const h = Math.round(s / 3600);
        if (h < 48) return h + " h ago";
        const d = Math.round(s / 86400);
        if (d < 60) return d + " days ago";
        return fmtUtc(iso).replace(/ \d\d:\d\d UTC$/, "");
    }
    function timeTag(iso) {
        if (!Number.isFinite(ms(iso))) return "—";
        return `<time datetime="${escapeHtml(new Date(ms(iso)).toISOString())}" title="${escapeHtml(fmtUtc(iso) + "\n" + fmtLocal(iso))}">${escapeHtml(ago(iso))}</time>`;
    }

    // ------------------------------------------------------------- flash

    function flash(message, bad) {
        let el = panel.querySelector(".pl-flash");
        if (!el) {
            el = document.createElement("p");
            el.className = "ctl-status pl-flash";
            el.setAttribute("role", "status");
            filtersEl.parentNode.insertBefore(el, listEl);
        }
        el.textContent = message;
        el.classList.toggle("is-bad", !!bad);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { el.textContent = ""; }, 9000);
    }

    /* The nav badge. Normally the quiet outlined count of everybody who has
       signed in — news to nobody. With a nickname flagged (29 Sept 2026) it
       becomes the flagged count instead, and drops .admin-nav-count-quiet
       so it is the filled amber pill the Errors and Missing Pieces badges
       are: something waiting to be dealt with. `c` is the server's counts,
       or a bare number for the all-count (reset). */
    const QUIET_TITLE = navCount ? (navCount.getAttribute("title") || "") : "";
    function setBadge(c) {
        if (!navCount) return;
        const counts = typeof c === "number" ? { all: c } : (c || {});
        /* Name clashes count as waiting too (4 Oct 2026): see nameClash; and
           flagged mottos (5 Oct 2026): see mottoWaiting. */
        // `waiting` counts each player once, whatever they are waiting on (the quick scan).
        const flagged = has(counts.waiting) ? Number(counts.waiting) || 0 : (Number(counts.flagged) || 0) + (Number(counts.clash) || 0) + (Number(counts.motto) || 0) + (Number(counts.habbo) || 0);
        const n = flagged > 0 ? flagged : Number(counts.all) || 0;
        navCount.textContent = n ? num(n) : "";
        navCount.hidden = !n;
        navCount.classList.toggle("admin-nav-count-quiet", flagged <= 0);
        navCount.classList.toggle("pl-nav-flagged", flagged > 0);
        navCount.setAttribute("title", flagged > 0
            ? `${num(flagged)} ${flagged === 1 ? "player" : "players"} to review (flagged nicknames, name clashes, mottos and Habbos)`
            : QUIET_TITLE);
    }
    function flagText(f) {
        if (!f) return "";
        return `Flagged: ${FLAG_REASONS[f.reason] || "filter word"}${f.word ? ` '${f.word}'` : ""}`;
    }

    // ------------------------------------------------------------- strip

    function renderSummary() {
        const c = counts || {};
        const stat = (n, one, many, title) => `<span class="admin-activity-stat"${title ? ` title="${escapeHtml(title)}"` : ""}><strong>${escapeHtml(num(n || 0))}</strong> ${escapeHtml(Number(n) === 1 ? one : many)}</span>`;
        summaryEl.innerHTML =
            stat(c.all, "player has signed in", "players have signed in", "Every Discord account with a players row") +
            stat(c.nick, "has a nickname", "have a nickname") +
            stat(c.locked, "nickname locked", "nicknames locked", "Locked nicknames can only be changed from here") +
            stat(c.flagged, "nickname flagged", "nicknames flagged", "Nicknames the word filter caught, waiting for an Allow or a Reject") +
            (Number(c.clash) ? stat(c.clash, "name clash", "name clashes", "Players whose linked Habbo name another player already has as a nickname — waiting for you to settle") : "") +
            (Number(c.motto) ? stat(c.motto, "motto flagged", "mottos flagged", "Habbo mottos with a filter word in them, kept off profiles and Mazer Cards — waiting for an Approve or a Keep hidden") : "") +
            (Number(c.habbo) ? stat(c.habbo, "Habbo to approve", "Habbos to approve", "Habbos guessed from a nickname that the player has not verified — waiting for an Approve or a Reject") : "") +
            (has(c.banned) ? stat(c.banned, "banned or cooling down", "banned or cooling down", "Players with a ban or cool-down in force on their account or their network") : "");
    }

    function renderUpdated() {
        if (!updatedEl) return;
        if (!loadedAt) { updatedEl.textContent = ""; return; }
        const d = new Date(loadedAt + skew);
        updatedEl.textContent = `Last updated ${d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false })} UTC`;
    }

    function buildFilters() {
        if (filtersBuilt) return;
        filtersBuilt = true;
        filtersEl.innerHTML = `
            <div class="ctl-seg pl-filter-tabs" role="group" aria-label="Which players" data-f="filter"></div>
            <div class="ctl-row se-search-row">
                <input type="search" class="ctl-input" data-f="q" placeholder="Search nicknames, Discord names, @usernames and ids" aria-label="Search players" maxlength="64">
                <div class="sort-box">
                    <select data-f="sort" aria-label="Sort by">${SORTS.map(([v, l]) => `<option value="${v}"${v === sort ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>
                </div>
            </div>`;
        filtersEl.querySelector('[data-f="filter"]').addEventListener("click", e => {
            const b = e.target.closest("[data-filter]");
            if (!b || b.dataset.filter === filter) return;
            filter = b.dataset.filter;
            skip = 0;
            renderFilters();
            load();
        });
        const q = filtersEl.querySelector('[data-f="q"]');
        q.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                const v = q.value.trim();
                if (v === query) return;
                query = v;
                skip = 0;
                load();
            }, 350);
        });
        filtersEl.querySelector('[data-f="sort"]').addEventListener("change", e => {
            sort = e.target.value;
            skip = 0;
            load();
        });
    }

    function renderFilters() {
        buildFilters();
        const c = counts || {};
        const n = { all: c.all, nick: c.nick, locked: c.locked, flagged: c.flagged, clash: c.clash, motto: c.motto, habbo: c.habbo, banned: c.banned, nonick: has(c.all) && has(c.nick) ? Number(c.all) - Number(c.nick) : null };
        filtersEl.querySelector('[data-f="filter"]').innerHTML = FILTERS.map(([k, label]) =>
            `<button type="button" class="btn-enter-mini${k === filter ? " active" : ""}" data-filter="${k}" aria-pressed="${k === filter}">${escapeHtml(label)}${has(n[k]) && Number(n[k]) ? ` (${escapeHtml(num(n[k]))})` : ""}</button>`).join("");
    }

    // -------------------------------------------------------------- list

    function activityBits(a) {
        if (!a) return [];
        const bits = [];
        if (has(a.dailyDays)) bits.push([`<strong>${escapeHtml(num(a.dailyDays))}</strong> daily`, `Daily games played: ${num(a.dailyDays)} (${num(a.dailyPoints)} points, speed bonus included)`]);
        if (a.ffBest && has(a.ffBest.points)) bits.push([`FF <strong>${escapeHtml(num(a.ffBest.points))}</strong>`, `Fallin' Furni best: ${num(a.ffBest.points)} points, ${num(a.ffBest.levels)} levels`]);
        if (Number(a.leads) > 0) bits.push([`<strong>${escapeHtml(num(a.leads))}</strong> sent`, `Missing Pieces submissions: ${num(a.leads)} (${num(a.leadsAccepted)} accepted)`]);
        return bits;
    }

    /* Flagged (29 Sept 2026): the filled amber chip (.de-chip.is-marked, as
       a marked lead wears), naming the word that matched so the admin can
       judge from the list. Rejected: the red outline a rejected lead wears,
       until the player picks another name. */
    function chipsHtml(p) {
        const out = [];
        /* Banned (29 Sept 2026): first, since it matters most — the danger
           fill for a ban, the dashed outline for a cool-down that ends. */
        const bc = Kit && Kit.chip(p.ban, nowMs());
        if (bc) out.push(`<span class="de-chip pl-chip-banned${bc.cooling ? " is-cooling" : ""}" title="${escapeHtml(bc.title)}">${escapeHtml(bc.text)}</span>`);
        if (p.nickFlag) out.push(`<span class="de-chip is-marked pl-chip-flagged" title="${escapeHtml("The word filter caught this nickname" + (p.nickFlag.at ? ", " + fmtUtc(p.nickFlag.at) : "") + ". Open the row to Allow or Reject it.")}">${escapeHtml(flagText(p.nickFlag))}</span>`);
        /* A NAME CLASH (4 Oct 2026): their Habbo name is somebody else's
           nickname, and a name already taken is never taken. */
        if (p.nameClash) out.push(`<span class="de-chip is-marked pl-chip-flagged" title="${escapeHtml("OriginsBot says their Habbo is " + p.nameClash.name + (p.nameClash.hotel ? " (" + p.nameClash.hotel + ")" : "") + ", but another player already has that nickname. Open the row to settle it.")}">Name clash: ${escapeHtml(p.nameClash.name)}</span>`);
        /* A FLAGGED MOTTO (5 Oct 2026, the owner's; MOTTO_WAITING in
           players-admin.js), waiting for a look. */
        if (habboWaiting(p)) out.push(`<span class="de-chip is-marked pl-chip-flagged" title="${escapeHtml("Their nickname matches the Habbo " + p.habboGuess.name + " (" + (p.habboGuess.hotel || "COM") + "), which they have not verified. Open the row to approve or reject it.")}">Habbo to approve</span>`);
        if (mottoWaiting(p)) out.push(`<span class="de-chip is-marked pl-chip-flagged" title="${escapeHtml("Their Habbo motto has '" + (p.mottoFlag.word || "a filter word") + "' in it, so it's hidden from their profile and Mazer Card. Open the row to Approve it or keep it hidden.")}">Motto flagged${p.mottoFlag.word ? ` '${escapeHtml(p.mottoFlag.word)}'` : ""}</span>`);
        if (p.nickRejected) out.push(`<span class="de-chip de-status-rejected pl-chip-rejected" title="${escapeHtml("Rejected" + (p.nickRejected.by ? " by " + p.nickRejected.by : "") + (p.nickRejected.at ? ", " + fmtUtc(p.nickRejected.at) : "") + " — they're asked to choose another on each visit until they do")}">Asked to change</span>`);
        /* No "Locked" chip any more (3 Oct 2026, the owner's): a red pill on
           the row read as something wrong with the account, when all it
           meant was that the player can't change their own nickname. It is
           the "Nickname lock" line in the row's detail instead. */
        if (!p.nickAsked) out.push(`<span class="de-chip pl-chip-unasked" title="Hasn't seen the Choose a nickname? window yet — it opens on their next visit">Not asked</span>`);
        return out.join("");
    }

    function rowHtml(p) {
        const idLine = p.id
            ? `<span class="se-mono pl-id">${escapeHtml(p.id)}</span> <button type="button" class="pl-copy" data-copy-id="${escapeHtml(p.id)}" title="Copy the Discord ID">Copy</button>`
            : "";
        return `
            ${faceHtml(p, "pl-face")}
            <div class="row-info">
                <div class="se-row-head">
                    <h3 class="pl-shown">${escapeHtml(shownOf(p))}</h3>
                    ${chipsHtml(p)}
                </div>
                <p class="row-creator pl-who">
                    <span title="Nickname">${p.nick ? `Nickname <strong>${escapeHtml(p.nick)}</strong>` : "No nickname"}</span>
                    <span class="se-sep">·</span>
                    <span title="Discord display name">Discord ${escapeHtml(dash(p.name))}</span>
                    ${p.username ? `<span class="se-sep">·</span> <span title="Discord username">@${escapeHtml(p.username)}</span>` : ""}
                    ${idLine ? `<span class="se-sep">·</span> ${idLine}` : ""}
                </p>
                <p class="se-when">First signed in ${timeTag(p.joinedAt)} <span class="se-sep">·</span> last ${timeTag(p.seenAt)}</p>
            </div>
            <div class="row-side se-side pl-side">
                ${activityBits(p.activity).map(([h, t]) => `<span class="admin-activity-meta" title="${escapeHtml(t)}">${h}</span>`).join("")}
            </div>`;
    }

    function render() {
        if (!apiReady()) {
            listEl.innerHTML = `<p class="admin-empty">Not available yet — reload. This copy of the page was loaded before the Players tab existed. <button type="button" class="ctl-btn" data-pl="reload">Reload</button></p>`;
            summaryEl.innerHTML = "";
            pagerEl.innerHTML = "";
            renderForget();
            return;
        }
        renderFilters();
        renderSummary();
        renderUpdated();
        renderForget();
        if (exportBtn) exportBtn.disabled = !players.length;
        if (loadError) {
            listEl.innerHTML = `<p class="admin-empty admin-form-error" role="alert">Could not load the players: ${escapeHtml(loadError)} <button type="button" class="ctl-btn" data-pl="retry">Retry</button></p>`;
            pagerEl.innerHTML = "";
            return;
        }
        // Keep what is being typed, and where, across the redraw.
        const active = document.activeElement;
        /* The ban form's reason box and end time (29 Sept 2026) as well as
           the nickname box: a detail read landing mid-word redraws them. */
        const typing = active && listEl.contains(active) && active.matches("input")
            ? { ref: active.dataset.ref || (active.closest(".pl-detail") || { dataset: {} }).dataset.for, bn: active.dataset.bn || "", start: active.selectionStart, end: active.selectionEnd }
            : null;

        listEl.innerHTML = "";
        if (!players.length) {
            listEl.innerHTML = `<p class="admin-empty">${query || filter !== "all" ? "Nobody matches that." : "Nobody has signed in yet."}</p>`;
            renderPager();
            return;
        }
        players.forEach(p => {
            const ref = refOf(p);
            const row = document.createElement("div");
            // se-row: the Errors panel's clickable row, border and open state.
            row.className = "chrome-list-row admin-row se-row pl-row" + (ref === openRef ? " is-open" : "") + (Kit && Kit.chip(p.ban, nowMs()) ? " is-banned" : "");
            row.dataset.ref = ref;
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            /* A row is a player: its text is their names. js/error-report.js's
               click breadcrumb says only "button" for anything inside one
               marked so, as the privacy policy promises (29 Sept 2026). */
            row.setAttribute("data-crumb-private", "");
            row.setAttribute("aria-expanded", String(ref === openRef));
            row.innerHTML = rowHtml(p);
            listEl.appendChild(row);
            if (ref === openRef) listEl.appendChild(buildDetail(p));
        });
        renderPager();

        if (typing && typing.ref) {
            const box = typing.bn
                ? listEl.querySelector(`.pl-detail[data-for="${cssEscape(typing.ref)}"] [data-bn="${cssEscape(typing.bn)}"]`)
                : listEl.querySelector(`.pl-nick-input[data-ref="${cssEscape(typing.ref)}"]`);
            if (box) {
                box.focus({ preventScroll: true });
                try { box.setSelectionRange(typing.start, typing.end); } catch (e) { /* not a text box */ }
            }
        }
    }

    function cssEscape(s) {
        return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
    }

    function renderPager() {
        if (!players.length) { pagerEl.innerHTML = ""; return; }
        const from = skip + 1;
        const to = skip + players.length;
        pagerEl.innerHTML = `
            <span class="admin-hint">Showing ${escapeHtml(num(from))}–${escapeHtml(num(to))} of ${escapeHtml(num(total))}</span>
            <button type="button" class="ctl-btn" data-page="prev"${skip > 0 ? "" : " disabled"}>Previous</button>
            <button type="button" class="ctl-btn" data-page="next"${to < total ? "" : " disabled"}>Next</button>`;
    }
    pagerEl.addEventListener("click", e => {
        const b = e.target.closest("[data-page]");
        if (!b || b.disabled) return;
        skip = b.dataset.page === "next" ? skip + PAGE : Math.max(0, skip - PAGE);
        openRef = null;
        load().then(() => panel.scrollIntoView({ block: "start", behavior: "smooth" }));
    });

    listEl.addEventListener("click", e => {
        const pl = e.target.closest("[data-pl]");
        if (pl) {
            if (pl.dataset.pl === "reload") location.reload();
            if (pl.dataset.pl === "retry") load();
            return;
        }
        const copy = e.target.closest("[data-copy-id]");
        if (copy) { e.stopPropagation(); copyText(copy.dataset.copyId, copy); return; }
        if (e.target.closest(".pl-detail")) return;
        const row = e.target.closest(".pl-row");
        if (!row || !listEl.contains(row)) return;
        toggle(row.dataset.ref);
    });
    listEl.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const row = e.target.closest(".pl-row");
        if (!row || e.target !== row) return;
        e.preventDefault();
        toggle(row.dataset.ref);
    });

    function toggle(ref) {
        openRef = openRef === ref ? null : ref;
        render();
        if (openRef) {
            const row = listEl.querySelector(`.pl-row[data-ref="${cssEscape(openRef)}"]`);
            if (row) row.focus({ preventScroll: true });
            loadDetail(openRef);
        }
    }

    // ------------------------------------------------------------ detail

    function factsHtml(p) {
        const f = [
            ["Shown on the boards as", escapeHtml(shownOf(p))],
            ["Nickname", p.nick ? escapeHtml(p.nick) : "None, so they're not on the boards"],
            ["Nickname last changed", p.nickAt ? `${escapeHtml(fmtUtc(p.nickAt))}` : "—"],
            ["Discord display name", escapeHtml(dash(p.name))],
            ["Discord username", p.username ? "@" + escapeHtml(p.username) : "—"],
            ["Discord ID", p.id ? `<span class="se-mono">${escapeHtml(p.id)}</span> <button type="button" class="pl-copy" data-copy-id="${escapeHtml(p.id)}">Copy</button>` : "Hidden from view-only accounts"],
            ["First signed in", `${escapeHtml(fmtUtc(p.joinedAt))}`],
            ["Last signed in", `${escapeHtml(fmtUtc(p.seenAt))}`],
            ["Nickname prompt", p.nickAsked ? "Seen" : "Not yet — it opens on their next visit"],
            ["Nickname lock", p.nickLocked ? `Locked${p.nickLockedBy ? " by " + escapeHtml(p.nickLockedBy) : ""}${p.nickLockedAt ? ", " + escapeHtml(fmtUtc(p.nickLockedAt)) : ""} — they can't change their nickname themselves` : "Not locked — they can change it themselves"],
            // The review (29 Sept 2026; see FLAGGED at the top).
            ["Word filter", p.nickFlag ? `${escapeHtml(flagText(p.nickFlag))}${p.nickFlag.at ? ", " + escapeHtml(fmtUtc(p.nickFlag.at)) : ""}` : "Nothing flagged"],
            ["Review", p.nickRejected
                ? `Rejected${p.nickRejected.by ? " by " + escapeHtml(p.nickRejected.by) : ""}${p.nickRejected.at ? ", " + escapeHtml(fmtUtc(p.nickRejected.at)) : ""} — they're asked to choose another nickname on each visit until they do`
                : "Not rejected"],
            ["Their changes today", has(p.changesToday) ? `${escapeHtml(num(p.changesToday))} of ${escapeHtml(num(p.changesPerDay || 5))}` : "—"],
            // What OriginsBot said (3 Oct 2026; see _originsbot.js).
            ["Habbo (OriginsBot)", habboText(p.habbo)]
        ];
        return `<dl class="se-grid pl-facts">${f.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
    }

    /* The detail's OriginsBot line (3 Oct 2026): the linked Habbo name and
       hotel, and whether it became the nickname — or why not. */
    function habboText(h) {
        if (!h) return "Not looked up yet";
        const when = h.checkedAt ? ", checked " + escapeHtml(fmtUtc(h.checkedAt)) : "";
        if (!h.name) return "No Habbo account linked" + when;
        const named = escapeHtml(h.name) + (h.hotel ? " (" + escapeHtml(h.hotel) + ")" : "");
        // Not OriginsBot's (5 Oct 2026): proved by a motto code, or set here.
        if (h.via === "motto") return named + " — verified by them with a motto code" + (h.checkedAt ? ", " + escapeHtml(fmtUtc(h.checkedAt)) : "");
        if (h.via && h.via.startsWith("admin:")) return named + " — linked by " + escapeHtml(h.via.slice(6)) + (h.checkedAt ? ", " + escapeHtml(fmtUtc(h.checkedAt)) : "");
        if (h.applied) return named + " — set as their nickname and locked" + when;
        if (h.clash) return named + " — not set: another player's nickname is the same name or too close to it" + (h.clashDismissed ? " (dismissed)" : "") + when;
        if (h.unusable) return named + " — not set: the boards can't display it" + when;
        return named + when;
    }

    function activityHtml(a, isFull) {
        if (!a) return `<p class="admin-hint">${isFull ? "Couldn't count their activity just now." : "Loading…"}</p>`;
        const rows = [];
        const games = a.games && typeof a.games === "object" ? a.games : null;
        // [what, the number, the detail beside it] — all plain text.
        const day = iso => (Number.isFinite(ms(iso)) ? fmtUtc(iso).replace(/ \d\d:\d\d UTC$/, "") : "");
        if (games) {
            Object.keys(games).sort().forEach(k => {
                const g = games[k] || {};
                rows.push([GAME_NAMES[k] || k, `${num(g.days)} ${Number(g.days) === 1 ? "day" : "days"}`, [`${num(g.points)} points`, g.last ? `last ${g.last}` : ""].filter(Boolean).join(" · ")]);
            });
        } else if (has(a.dailyDays)) {
            rows.push(["Daily games", `${num(a.dailyDays)} ${Number(a.dailyDays) === 1 ? "day" : "days"}`, `${num(a.dailyPoints)} points`]);
        }
        if (!rows.length && has(a.dailyDays)) rows.push(["Daily games", "none played", ""]);
        if (a.ffBest !== undefined) {
            rows.push(["Fallin' Furni best", a.ffBest ? `${num(a.ffBest.points)} points` : "no run on the board",
                a.ffBest ? [`${num(a.ffBest.levels)} levels`, day(a.ffBest.at)].filter(Boolean).join(" · ") : ""]);
        }
        if (has(a.ffRuns)) rows.push(["Fallin' Furni runs logged", num(a.ffRuns), has(a.ffTournaments) ? `${num(a.ffTournaments)} tournament ${Number(a.ffTournaments) === 1 ? "entry" : "entries"}` : ""]);
        if (has(a.leads)) rows.push(["Missing Pieces sent", num(a.leads), `${num(a.leadsAccepted)} accepted`]);
        if (has(a.messages)) rows.push(["Contact messages", num(a.messages), ""]);
        if (!rows.length) return `<p class="admin-hint">Nothing counted.</p>`;
        return `<table class="ff-table se-table pl-activity"><tbody>${rows.map(r =>
            `<tr><th scope="row">${escapeHtml(r[0])}</th><td class="ff-num">${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td></tr>`).join("")}</tbody></table>`;
    }

    function historyHtml(list, isFull) {
        if (!isFull) return `<p class="admin-hint">Loading…</p>`;
        if (!Array.isArray(list) || !list.length) return `<p class="admin-hint">No changes recorded. (The history started on 29 Sept 2026.)</p>`;
        return `<ol class="pl-history">${list.map(h => {
            const by = String(h.by || "");
            const who = by === "player" ? "the player" : by.startsWith("admin:") ? by.slice(6) + " (admin)" : (by || "—");
            // A review's entry (29 Sept 2026) names the name it was about.
            const did = h.action === "allowed" ? "allowed" : h.action === "rejected" ? "rejected" : "";
            return `<li><span class="pl-history-nick">${h.nick ? escapeHtml(h.nick) : "<em>cleared</em>"}</span>
                <span class="admin-hint">${did ? `<strong>${escapeHtml(did)}</strong> ` : ""}by ${escapeHtml(who)}, <span title="${escapeHtml(fmtLocal(h.at))}">${escapeHtml(fmtUtc(h.at))}</span></span></li>`;
        }).join("")}</ol>`;
    }

    function actionsHtml(p, ref) {
        if (!canWrite()) return `<p class="admin-hint">This account is view-only.</p>`;
        const draft = nickDrafts.has(ref) ? nickDrafts.get(ref) : (p.nick || "");
        return `
            <div class="pl-edit">
                ${clashHtml(p)}
                ${habboGuessHtml(p)}
                ${habboLinkHtml(p)}
                ${mottoHtml(p)}
                ${reviewHtml(p)}
                <label class="ctl-label" for="pl-nick-${domId(ref)}">Nickname</label>
                <div class="ctl-row">
                    <input type="text" class="ctl-input pl-nick-input" id="pl-nick-${domId(ref)}" data-ref="${escapeHtml(ref)}"
                           maxlength="${NICK_MAX}" autocomplete="off" spellcheck="false" autocapitalize="off"
                           placeholder="${escapeHtml(p.name || "Nickname")}" value="${escapeHtml(draft)}"${busy ? " disabled" : ""}>
                    <button type="button" class="ctl-btn pl-write" data-a="save"${busy ? " disabled" : ""}>${p.nick ? "Save nickname" : "Set nickname"}</button>
                </div>
                <p class="admin-hint">2–20 letters, numbers, spaces and - _ . ' ! ?, not taken by another player — the rules a player's own is held to. Your choice isn't run past the word filter, and it ends any review. Doesn't count towards their five changes a day, and renames their rows on every board.</p>
                <div class="ctl-actions">
                    ${p.nick ? `<button type="button" class="ctl-btn admin-delete-btn pl-write" data-a="clear"${busy ? " disabled" : ""}>Remove nickname</button>` : ""}
                    <button type="button" class="ctl-btn pl-write" data-a="lock"${busy ? " disabled" : ""} title="${p.nickLocked ? "Let the player change their nickname again" : "Stop the player changing their nickname themselves; their Profile tells them to ask the admins"}">${p.nickLocked ? "Unlock nickname" : "Lock nickname"}</button>
                    <button type="button" class="ctl-btn pl-write" data-a="prompt"${!p.nickAsked ? " data-off" : ""}${busy || !p.nickAsked ? " disabled" : ""} title="${p.nickAsked ? "Show them the Choose a nickname? window again on their next visit (not while they have a nickname, or while it is locked)" : "They haven't seen it yet"}">Show the nickname prompt again</button>
                </div>
                ${turnedDownHtml(p)}
                <p class="ctl-status pl-status" data-a="status" role="status"></p>
            </div>`;
    }

    /* The names the admins have turned down for this player (30 Sept 2026;
       TURNED DOWN in player-nick.js). Each one stays refused after they
       have moved off it, so this is the way to let one back: "Allow again"
       takes it off the list (unTurnDown in players-admin.js). They are
       shown as the row stores them — boiled down to lower-case letters and
       digits, which is how the rule compares names — not as typed. Only in
       the full detail, which is where the list comes from. */
    function turnedDownHtml(p) {
        const list = Array.isArray(p.nickTurnedDown) ? p.nickTurnedDown.filter(k => typeof k === "string" && k) : [];
        if (!list.length) return "";
        return `
                <span class="ctl-label">Turned-down names</span>
                <p class="admin-hint">They can't choose these (or anything that reads the same) again. Stored boiled down to letters and numbers, as shown.</p>
                ${list.map(k => `
                <div class="ctl-row">
                    <span class="pl-history-nick">${escapeHtml(k)}</span>
                    <button type="button" class="ctl-btn pl-write" data-a="untd" data-key="${escapeHtml(k)}"${busy ? " disabled" : ""} title="Let them choose this name again">Allow again</button>
                </div>`).join("")}`;
    }

    async function unTurnDown(p, key) {
        if (!key) return false;
        const ok = await ask(`Take <strong>${escapeHtml(key)}</strong> off ${escapeHtml(shownOf(p))}'s turned-down names? They'll be able to choose it again.`);
        if (!ok) return false;
        return write(p, { unTurnDown: key }, "Done. They can choose that name again.");
    }

    /* The review's two buttons (29 Sept 2026; see FLAGGED at the top).
       Allow for a flagged name, or to take back a rejection; Reject for any
       nickname not already waiting on the player. Neither is offered where
       it would do nothing (the server answers such a press with no change
       anyway). Only reached for owners and admins: actionsHtml has already
       shown a viewer "view-only". */
    /* A NAME CLASH to settle (4 Oct 2026, the owner's; CLASHING in
       players-admin.js). OriginsBot never takes a name from anybody, so it
       waits here: give this player a nickname above (their Habbo name once
       you have freed it from the other player, or anything else), or
       Dismiss to leave both as they are. Either way OriginsBot stops asking. */
    function clashHtml(p) {
        if (!p.nameClash) return "";
        const name = escapeHtml(p.nameClash.name) + (p.nameClash.hotel ? " (" + escapeHtml(p.nameClash.hotel) + ")" : "");
        return `
                <div class="pl-review">
                    <p class="admin-hint">Name clash: OriginsBot says their Habbo is <strong>${name}</strong>, but another player already has that nickname, so it wasn't set. Nobody's name is taken from them automatically. To give it to this player, clear or change the other player's nickname first, then set it here. Or set any other nickname here, or Dismiss to leave both as they are.</p>
                    <div class="ctl-actions">
                        <button type="button" class="ctl-btn pl-write" data-a="dismiss-clash"${busy ? " disabled" : ""} title="Leave both players as they are; OriginsBot stops asking">Dismiss</button>
                    </div>
                </div>`;
    }

    /* THEIR HABBO MOTTO, when the filter caught it or an admin passed it
       (5 Oct 2026, the owner's; MOTTOS in netlify/functions/profiles.js).
       Approve shows that exact motto again; a new one is checked afresh.
       Keep hidden stops it waiting. An approved one can be hidden again. */
    function mottoHtml(p) {
        const off = busy ? " disabled" : "";
        if (p.mottoFlag) {
            const f = p.mottoFlag;
            return `
                <div class="pl-review">
                    <p class="admin-hint">Habbo motto ${f.reviewed ? "kept hidden" : "flagged"}: <strong>"${escapeHtml(f.text)}"</strong>${f.word ? ` (filter word '${escapeHtml(f.word)}')` : ""}. It's hidden from their profile and can't go on their Mazer Card${f.reviewed ? "" : " until you decide"}.${f.at ? ` Caught ${escapeHtml(fmtUtc(f.at))}.` : ""}</p>
                    <div class="ctl-actions">
                        <button type="button" class="ctl-btn pl-write" data-a="motto-approve"${off} title="Show this exact motto; if they change it, the new one is checked again">Approve motto</button>
                        ${f.reviewed ? "" : `<button type="button" class="ctl-btn pl-write" data-a="motto-hide"${off} title="Keep it off their profile and stop it waiting here">Keep hidden</button>`}
                    </div>
                </div>`;
        }
        if (p.mottoApproved) {
            const a = p.mottoApproved;
            return `
                <div class="pl-review">
                    <p class="admin-hint">Habbo motto approved${a.by ? ` by ${escapeHtml(a.by)}` : ""}${a.at ? `, ${escapeHtml(fmtUtc(a.at))}` : ""}: <strong>"${escapeHtml(a.text)}"</strong>. It shows on their profile while it stays exactly this.</p>
                    <div class="ctl-actions">
                        <button type="button" class="ctl-btn pl-write" data-a="motto-revoke"${off} title="Hide this motto again">Hide it again</button>
                    </div>
                </div>`;
        }
        return "";
    }
    const mottoWaiting = p => !!(p && p.mottoFlag && !p.mottoFlag.reviewed);
    // A Habbo guessed from their nickname, the player not verifying it (5 Oct 2026).
    const habboWaiting = p => !!(p && p.habboGuess && p.habboGuess.state === "declined");

    /* LINK A HABBO BY HAND (5 Oct 2026, the owner's; habboLinkSet in
       players-admin.js): the name and hotel of their Habbo Origins account,
       linked as a verified one — their Maze Rats badges and all, and
       OriginsBot leaves it be. The server checks it exists on that hotel and
       is nobody else's. Unlink takes it away. */
    const HOTELS = [["COM", ".com"], ["ES", ".es"], ["BR", ".com.br"]];
    function habboLinkHtml(p) {
        const h = p.habbo && p.habbo.name ? p.habbo : null;
        const off = busy ? " disabled" : "";
        const id = `pl-habbo-${domId(refOf(p))}`;
        return `
            <div class="pl-review pl-habbo-link">
                <label class="ctl-label" for="${id}">Habbo Origins account</label>
                <p class="admin-hint">${h ? `Linked: <strong>${escapeHtml(h.name)}</strong> (${escapeHtml(h.hotel || "COM")}). Type another to change it.` : "None linked. Link their Habbo here and it counts as verified."}</p>
                <div class="ctl-row">
                    <input type="text" class="ctl-input pl-habbo-name" id="${id}" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Habbo username" value="${escapeHtml(h ? h.name : "")}"${off}>
                    <select class="ctl-input pl-habbo-hotel" aria-label="Hotel"${off}>${HOTELS.map(([v, l]) => `<option value="${v}"${(h ? h.hotel : "COM") === v ? " selected" : ""}>${l}</option>`).join("")}</select>
                    <button type="button" class="ctl-btn pl-write" data-a="habbo-link"${off}>${h ? "Change" : "Link Habbo"}</button>
                    ${h ? `<button type="button" class="ctl-btn admin-delete-btn pl-write" data-a="habbo-unlink"${off}>Unlink</button>` : ""}
                </div>
            </div>`;
    }

    /* A GUESSED HABBO (5 Oct 2026, the owner's; _habbo-guess.js). Shown on
       their profile unverified — avatar and motto, none of the badges a
       Habbo name earns. Approve links it as OriginsBot would, badges and
       all; Reject takes it away. Shown while it waits, and while it is
       still only offered to the player. */
    function habboGuessHtml(p) {
        const g = p.habboGuess;
        if (!g || !g.name || g.state === "rejected") return "";
        const off = busy ? " disabled" : "";
        const hotel = escapeHtml(g.hotel || "COM");
        return `
            <div class="pl-review">
                <p class="admin-hint">Habbo guessed from their nickname: <strong>${escapeHtml(g.name)}</strong> (${hotel}). It shows on their profile, unverified, and they have no Maze Rats badges until it's verified. ${g.state === "declined" ? "They chose not to verify it, so it waits for you." : "They have been offered to verify it."}</p>
                <div class="ctl-actions">
                    <button type="button" class="ctl-btn pl-write" data-a="habbo-approve"${off} title="Link this Habbo to them, as OriginsBot would: it counts for the Maze Owner, Event Host and Contributor badges">Approve Habbo</button>
                    <button type="button" class="ctl-btn pl-write" data-a="habbo-reject"${off} title="Take it off their profile; it is not guessed again for this nickname">Reject</button>
                </div>
            </div>`;
    }

    function reviewHtml(p) {
        const canAllow = !!(p.nickFlag || p.nickRejected);
        const canReject = !!p.nick && !(p.nickRejected && !p.nickFlag);
        if (!canAllow && !canReject) return "";
        const lead = p.nickFlag
            ? `The word filter flagged this nickname (${escapeHtml(flagText(p.nickFlag).replace(/^Flagged: /, ""))}). It's on the boards as it is until you decide.`
            : p.nickRejected
                ? "You've asked them to choose another nickname. Allow takes that back."
                : "The filter didn't flag this one. Reject it if it shouldn't be on the boards.";
        return `
                <div class="pl-review">
                    <p class="admin-hint">${lead}</p>
                    <div class="ctl-actions">
                        ${canAllow ? `<button type="button" class="ctl-btn pl-write" data-a="allow"${busy ? " disabled" : ""} title="Keep the nickname: the flag (and any rejection) goes">Allow</button>` : ""}
                        ${canReject ? `<button type="button" class="ctl-btn pl-write" data-a="reject"${busy ? " disabled" : ""} title="Keep it for now, and ask the player to choose another on their next visit">Reject</button>` : ""}
                    </div>
                </div>`;
    }

    /* `seen` is the nickname on screen: if the player has changed it since
       this was loaded, the server says 409 rather than let the review land
       on a name nobody has looked at (see review in players-admin.js). */
    async function reviewNick(p, which) {
        const change = { review: which, seen: p.nick || "" };
        if (which === "allow") return write(p, change, "Allowed. The nickname stays, and nothing is waiting on it now.");
        const ok = await ask(`Reject <strong>${escapeHtml(p.nick || "")}</strong>? It stays on the boards for now, and they're asked to choose a different nickname on their next visit (and each visit after, until they do). This doesn't lock or clear it.`);
        if (!ok) return false;
        return write(p, change, "Rejected. They'll be asked to choose a new nickname on their next visit.");
    }

    function forgetBoxHtml(p, ref) {
        if (!isOwner() || !p.id) return "";
        const f = forgets.get(ref) || { state: "idle" };
        let body;
        if (f.state === "looking") body = `<p class="admin-hint">Counting what would go…</p>`;
        else if (f.state === "shown") {
            body = `<p class="admin-hint">Forgetting them removes:</p>${countsHtml(f.data && f.data.counts)}
                <div class="ctl-actions"><button type="button" class="ctl-btn admin-delete-btn pl-owner" data-a="forget-go"${busy ? " disabled" : ""}>Forget this player</button>
                <button type="button" class="ctl-btn" data-a="forget-cancel">Cancel</button></div>`;
        } else {
            body = `<div class="ctl-actions"><button type="button" class="ctl-btn admin-delete-btn pl-owner" data-a="forget-look"${busy ? " disabled" : ""}>Forget this player…</button></div>`;
        }
        return `
            <h4 class="admin-subheading se-sub">Forget this player <span class="admin-hint">owner only</span></h4>
            <p class="admin-hint">Permanently deletes what the site keeps about them — see what first; nothing goes until you confirm.</p>
            ${f.error ? `<p class="admin-form-error" role="alert">${escapeHtml(f.error)}</p>` : ""}
            ${body}`;
    }

    // ------------------------------------------------------- moderation
    /* The Moderation block (29 Sept 2026; see MODERATION at the top).
       What is in force, with Lift and Change; or, with nothing in force,
       the controls to ban. A view-only account sees what is in force and
       nothing to press, as with every other write here. */

    function playerBans(p) {
        if (!bansList || !p.id) return [];
        const now = nowMs();
        return bansList.filter(b => Kit.isActive(b, now) &&
            ((b.kind === "player" && (b.value === p.id || b.playerId === p.id)) ||
             (b.kind === "nethash" && b.playerId === p.id)));
    }

    function banDraft(ref) {
        if (!banDrafts.has(ref)) banDrafts.set(ref, Kit.fresh());
        return banDrafts.get(ref);
    }

    function inForceHtml(b, ref) {
        const now = nowMs();
        const edit = banEdits.get(ref);
        const editing = edit && edit.id === b.id;
        const on = b.kind === "nethash" ? "Their network" : "Their account";
        return `
            <div class="pl-ban${b.until != null ? " is-cooling" : ""}">
                <p class="pl-ban-level"><strong>${escapeHtml(Kit.levelLong(b.level))}</strong> <span class="admin-hint">· ${escapeHtml(on)}</span></p>
                <p class="admin-hint">${escapeHtml(Kit.untilText(b, now))}</p>
                ${b.reason ? `<p class="pl-ban-reason">${escapeHtml(b.reason)}</p>` : ""}
                <p class="admin-hint">By ${escapeHtml(b.by || "—")}, ${escapeHtml(Kit.fmtUtc(b.at))}</p>
                ${canWrite() && !editing ? `
                <div class="ctl-actions">
                    <button type="button" class="ctl-btn pl-write" data-a="ban-change" data-ban-id="${escapeHtml(b.id)}"${busy ? " disabled" : ""}>Change</button>
                    <button type="button" class="ctl-btn pl-write pl-ban-lift" data-a="ban-lift" data-ban-id="${escapeHtml(b.id)}"${busy ? " disabled" : ""}>Lift</button>
                </div>` : ""}
                ${editing ? `
                ${Kit.formHtml(edit.state, { change: true, ended: Kit.endedAt(b, now), now, uid: "pl-banedit-" + domId(ref) })}
                <div class="ctl-actions">
                    <button type="button" class="ctl-btn pl-write" data-a="ban-change-save"${busy ? " disabled" : ""}>Save change</button>
                    <button type="button" class="ctl-btn" data-a="ban-change-cancel">Cancel</button>
                </div>` : ""}
            </div>`;
    }

    function moderationHtml(p, ref) {
        if (!Kit) return "";
        const now = nowMs();
        const msg = modMsgs.get(ref);
        const line = `<p class="ctl-status pl-mod-status${msg && msg.bad ? " is-bad" : ""}" role="status">${msg ? escapeHtml(msg.text) : ""}</p>`;
        const summary = Kit.chip(p.ban, now);
        let body;
        if (!canWrite()) {
            body = summary
                ? `<p><strong>${escapeHtml(Kit.levelLong(p.ban.level))}</strong> <span class="admin-hint">· ${escapeHtml(summary.text)}</span></p>`
                : `<p class="admin-hint">Not banned.</p>`;
            return `<h4 class="admin-subheading se-sub">Moderation</h4><div class="pl-mod">${body}</div>`;
        }
        const mine = playerBans(p);
        if (mine.length) {
            body = mine.map(b => inForceHtml(b, ref)).join("");
        } else if (summary) {
            /* The row says banned but the list has no ban to match it: still
               loading, or a network ban the list doesn't tie to a player. */
            body = `
                <div class="pl-ban${summary.cooling ? " is-cooling" : ""}">
                    <p class="pl-ban-level"><strong>${escapeHtml(Kit.levelLong(p.ban.level))}</strong> <span class="admin-hint">· ${escapeHtml(summary.text)}</span></p>
                    <p class="admin-hint">${bansList ? (bansError ? "Couldn't read the ban list: " + escapeHtml(bansError) + "." : "Lift or change it on the Bans tab.") : "Reading the ban list…"}</p>
                    <div class="ctl-actions"><button type="button" class="ctl-btn" data-a="ban-open-tab">Open the Bans tab</button></div>
                </div>`;
        } else {
            body = `
                ${Kit.formHtml(banDraft(ref), { now, targets: { net: !!p.hasNetHash }, uid: "pl-ban-" + domId(ref) })}
                <div class="ctl-actions">
                    <button type="button" class="ctl-btn admin-delete-btn pl-write pl-ban-go" data-a="ban-go"${busy ? " disabled" : ""}>Ban…</button>
                </div>`;
        }
        return `<h4 class="admin-subheading se-sub">Moderation</h4><div class="pl-mod">${body}${line}</div>`;
    }

    function modSay(ref, text, bad) {
        if (text) modMsgs.set(ref, { text, bad: !!bad });
        else modMsgs.delete(ref);
        const el = listEl.querySelector(`.pl-detail[data-for="${cssEscape(ref)}"] .pl-mod-status`);
        if (el) {
            el.textContent = text || "";
            el.classList.toggle("is-bad", !!bad);
        } else if (text) {
            flash(text, bad);
        }
    }

    async function loadBans() {
        if (!Kit || typeof Api.getBans !== "function" || !token()) return;
        const gen = ++bansGen;
        try {
            const data = await Api.getBans(token());
            if (gen !== bansGen) return;
            bansList = (Array.isArray(data) ? data : (data && Array.isArray(data.bans) ? data.bans : [])).map(Kit.normalise).filter(Boolean);
            bansError = "";
        } catch (err) {
            if (gen !== bansGen) return;
            if (sessionGone(err)) return;
            bansList = bansList || [];
            bansError = errText(err);
        }
        bansAt = Date.now();
        if (openRef) render();
    }

    // After a ban, a lift or a change: the rows, the counts, this list,
    // and the Bans tab's own copy (admin.js lends window.AdminBansReload).
    async function afterBanWrite() {
        await Promise.all([load(), loadBans()]);
        if (typeof window.AdminBansReload === "function") {
            try { window.AdminBansReload(); } catch (e) { /* its own panel says */ }
        }
    }

    function banApiReady() {
        return typeof Api.createBan === "function" && typeof Api.updateBan === "function" && typeof Api.liftBan === "function";
    }

    async function banGo(p) {
        const ref = refOf(p);
        if (busy || !canWrite() || !p.id) return;
        if (!banApiReady()) { modSay(ref, "Not available yet — reload the page.", true); return; }
        const st = banDraft(ref);
        const choice = Kit.read(st, nowMs());
        if (choice.error) { modSay(ref, choice.error, true); return; }
        const wantNet = st.target === "net" || st.target === "both";
        if (wantNet && !p.hasNetHash) { modSay(ref, Kit.NO_NET, true); return; }
        const kinds = st.target === "both" ? ["player", "nethash"] : [wantNet ? "nethash" : "player"];
        const who = shownOf(p);
        const whoText = st.target === "both" ? `${who}'s account and their network` : wantNet ? `${who}'s network` : `${who}'s account`;
        const extra = st.target === "both" ? " That's two bans, lifted separately." : wantNet ? " Everyone on that network is caught, not only them." : "";
        if (!(await ask(Kit.summaryHtml(whoText, choice) + escapeHtml(extra)))) return;
        if (busy) return;
        setBusy(true);
        modSay(ref, "Banning…");
        const done = [];
        let failed = null;
        for (const kind of kinds) {
            const body = Object.assign({ kind, playerId: p.id }, kind === "player" ? { value: p.id } : {}, Kit.postBody(choice));
            try {
                await Api.createBan(token(), body);
                done.push(kind);
            } catch (err) {
                failed = { kind, err };
                break;
            }
        }
        setBusy(false);
        if (failed && sessionGone(failed.err)) { modSay(ref, "Not banned: your session had expired. Sign in, then try again.", true); return; }
        let text;
        let bad = false;
        if (!failed) {
            banDrafts.delete(ref);
            text = kinds.length === 2 ? "Banned: their account and their network." : kinds[0] === "nethash" ? "Banned: their network." : "Banned: their account.";
        } else {
            bad = true;
            // The one answer with a sentence of its own: no network on file yet.
            // 409 is either { noNetHash } or "already banned" ({ id }): only the first is this sentence.
            const why = failed.err && failed.err.status === 409 && failed.err.data && failed.err.data.noNetHash ? Kit.NO_NET : errText(failed.err);
            text = done.length ? `Their account is banned, but not their network: ${why}` : `Not banned: ${why}`;
        }
        modSay(ref, text, bad);
        if (done.length) await afterBanWrite();
        modSay(ref, text, bad);
    }

    async function banLift(p, id) {
        const ref = refOf(p);
        const b = (bansList || []).find(x => x.id === id);
        if (!b || busy || !canWrite()) return;
        if (!banApiReady()) { modSay(ref, "Not available yet — reload the page.", true); return; }
        if (!(await ask(Kit.liftHtml(Object.assign({}, b, { name: b.name || shownOf(p) }), nowMs())))) return;
        if (busy) return;
        setBusy(true);
        modSay(ref, "Lifting…");
        try {
            await Api.liftBan(token(), id);
            setBusy(false);
            banEdits.delete(ref);
            modSay(ref, "Lifted.");
            await afterBanWrite();
            modSay(ref, "Lifted. It takes effect on their next page load.");
        } catch (err) {
            setBusy(false);
            if (sessionGone(err)) { modSay(ref, "Not lifted: your session had expired. Sign in, then try again.", true); return; }
            modSay(ref, "Not lifted: " + (err && err.status === 404 ? "it was already gone." : errText(err)), true);
            if (err && err.status === 404) afterBanWrite();
        }
    }

    function banChangeOpen(p, id) {
        const ref = refOf(p);
        const b = (bansList || []).find(x => x.id === id);
        if (!b) return;
        banEdits.set(ref, { id, state: Kit.fresh({ level: b.level || "soft", length: Kit.endedAt(b, Date.now()) ? "24h" : "keep", reason: b.reason || "" }) });
        modMsgs.delete(ref);
        render();
    }

    async function banChangeSave(p) {
        const ref = refOf(p);
        const edit = banEdits.get(ref);
        const b = edit && (bansList || []).find(x => x.id === edit.id);
        if (!b || busy || !canWrite()) return;
        if (!banApiReady()) { modSay(ref, "Not available yet — reload the page.", true); return; }
        const choice = Kit.read(edit.state, nowMs());
        if (choice.error) { modSay(ref, choice.error, true); return; }
        const who = b.kind === "nethash" ? `${shownOf(p)}'s network` : `${shownOf(p)}'s account`;
        if (!(await ask(Kit.changeHtml(who, choice, b)))) return;
        if (busy || banEdits.get(ref) !== edit) return;
        setBusy(true);
        modSay(ref, "Saving…");
        try {
            await Api.updateBan(token(), Kit.putBody(choice, b.id));
            setBusy(false);
            banEdits.delete(ref);
            await afterBanWrite();
            modSay(ref, "Changed.");
        } catch (err) {
            setBusy(false);
            if (sessionGone(err)) { modSay(ref, "Not saved: your session had expired. Sign in, then try again.", true); return; }
            modSay(ref, "Not saved: " + errText(err), true);
        }
    }

    function openBansTab() {
        const btn = document.querySelector('.chrome-nav-btn[data-panel="bans"]');
        if (btn) btn.click();
    }

    function buildDetail(listPlayer) {
        const ref = refOf(listPlayer);
        const full = details.get(ref);
        const p = full ? Object.assign({}, listPlayer, full, { activity: full.activity || listPlayer.activity }) : listPlayer;
        const failed = detailErrors.get(ref);
        const el = document.createElement("div");
        el.className = "se-detail pl-detail";
        el.dataset.for = ref;
        // Names throughout ("Remove <nick>?", the history): see the row's note.
        el.setAttribute("data-crumb-private", "");
        el.innerHTML = `
            <div class="pl-detail-head">
                ${faceHtml(p, "pl-face pl-face-big")}
                <div>
                    <p class="pl-detail-name">${escapeHtml(shownOf(p))}</p>
                    <p class="admin-hint">${p.username ? "@" + escapeHtml(p.username) : escapeHtml(dash(p.name))}</p>
                </div>
            </div>
            ${failed ? `<p class="admin-empty admin-form-error">Could not load the rest: ${escapeHtml(failed)} <button type="button" class="ctl-btn" data-a="retry-detail">Retry</button></p>` : ""}
            <div class="pl-detail-grid">
                <div>
                    ${factsHtml(p)}
                    ${actionsHtml(p, ref)}
                </div>
                <div>
                    <h4 class="admin-subheading se-sub">What they've played</h4>
                    ${activityHtml(full ? full.activity : null, !!full || !!failed)}
                    <h4 class="admin-subheading se-sub">Nickname history <span class="admin-hint">last ten, newest first</span></h4>
                    ${historyHtml(full && full.nickHistory, !!full || !!failed)}
                    ${moderationHtml(p, ref)}
                    ${forgetBoxHtml(p, ref)}
                </div>
            </div>`;

        const input = el.querySelector(".pl-nick-input");
        if (input) {
            input.addEventListener("input", () => nickDrafts.set(ref, input.value));
            input.addEventListener("keydown", e => {
                if (e.key === "Enter") { e.preventDefault(); writeNick(p, input.value); }
                if (e.key === "Escape") { nickDrafts.delete(ref); input.value = p.nick || ""; }
            });
        }
        el.addEventListener("click", e => {
            const copy = e.target.closest("[data-copy-id]");
            if (copy) { copyText(copy.dataset.copyId, copy); return; }
            const b = e.target.closest("[data-a]");
            if (!b || b.disabled || b.tagName !== "BUTTON") return;
            const a = b.dataset.a;
            if (a === "save") writeNick(p, (el.querySelector(".pl-nick-input") || {}).value || "");
            else if (a === "clear") clearNick(p);
            else if (a === "lock") write(p, { locked: !p.nickLocked }, p.nickLocked ? "Unlocked. They can change their nickname again." : "Locked. They can't change their nickname themselves now.");
            else if (a === "allow" || a === "reject") reviewNick(p, a);
            else if (a === "motto-approve") write(p, { motto: "approve", seen: p.mottoFlag ? p.mottoFlag.text : "" }, "Approved. That motto shows on their profile and can go on their Mazer Card.");
            else if (a === "motto-hide") write(p, { motto: "hide" }, "Kept hidden. It stays off their profile and Mazer Card.");
            else if (a === "habbo-approve") write(p, { habboGuess: "approve", seen: p.habboGuess ? p.habboGuess.name : "" }, "Approved. That Habbo is linked to them now, and their Maze Rats badges show.");
            else if (a === "habbo-link") {
                const name = ((el.querySelector(".pl-habbo-name") || {}).value || "").trim();
                const hotel = (el.querySelector(".pl-habbo-hotel") || {}).value || "COM";
                if (!name) { say(ref, "Type their Habbo username first.", true); return; }
                write(p, { habboLink: { name, hotel } }, `Linked. ${name} is their Habbo now, and their Maze Rats badges show.`);
            }
            else if (a === "habbo-unlink") {
                ask(`Unlink <strong>${escapeHtml(p.habbo ? p.habbo.name : "")}</strong> from them? Their Maze Rats badges go until a Habbo is linked again.`)
                    .then(ok => { if (ok) write(p, { habboLink: null }, "Unlinked."); });
            }
            else if (a === "habbo-reject") write(p, { habboGuess: "reject", seen: p.habboGuess ? p.habboGuess.name : "" }, "Rejected. It's off their profile.");
            else if (a === "motto-revoke") write(p, { motto: "revoke" }, "Hidden again. It's off their profile and Mazer Card.");
            else if (a === "dismiss-clash") write(p, { dismissClash: true }, "Dismissed. Both keep their names, and OriginsBot won't ask about it again.");
            else if (a === "untd") unTurnDown(p, b.dataset.key || "");
            else if (a === "prompt") write(p, { resetPrompt: true }, "Done. They'll be asked to choose a nickname on their next visit, if they have none and it isn't locked.");
            else if (a === "forget-look") forgetLook(p);
            else if (a === "forget-cancel") { forgets.delete(ref); render(); }
            else if (a === "forget-go") forgetGo(p);
            else if (a === "retry-detail") { detailErrors.delete(ref); render(); loadDetail(ref); }
            // Moderation (29 Sept 2026).
            else if (a === "ban-go") banGo(p);
            else if (a === "ban-lift") banLift(p, b.dataset.banId);
            else if (a === "ban-change") banChangeOpen(p, b.dataset.banId);
            else if (a === "ban-change-save") banChangeSave(p);
            else if (a === "ban-change-cancel") { banEdits.delete(ref); modMsgs.delete(ref); render(); }
            else if (a === "ban-open-tab") openBansTab();
        });
        /* The ban form keeps its state in banDrafts / banEdits, so a redraw
           (a detail read landing) puts back what was chosen. */
        if (Kit) {
            const edit = banEdits.get(ref);
            el.querySelectorAll("[data-bn-form]").forEach(form => {
                const state = form.closest(".pl-ban") && edit ? edit.state : banDraft(ref);
                Kit.wire(form, state, null, nowMs);
            });
        }
        return el;
    }

    // What a write says, in the open detail's status line (or the flash).
    function say(ref, text, bad) {
        const d = listEl.querySelector(`.pl-detail[data-for="${cssEscape(ref)}"] .pl-status`);
        if (d) {
            d.textContent = text;
            d.classList.toggle("is-bad", !!bad);
        } else {
            flash(text, bad);
        }
    }

    // ----------------------------------------------------------- loading

    function takeClock(data) {
        const t = ms(data && data.now);
        if (Number.isFinite(t)) skew = t - Date.now();
    }

    /* `stepped` is load's own retry, below — callers pass nothing. */
    async function load(stepped) {
        if (!apiReady()) { render(); return; }
        if (!token()) return;
        const gen = ++loadGen;
        if (!players.length && !loadError) listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        if (refreshBtn) refreshBtn.disabled = true;
        try {
            const params = { filter, sort, limit: PAGE, skip };
            if (query) params.q = query;
            const data = await Api.getPlayers(token(), params);
            if (gen !== loadGen) return;
            takeClock(data);
            players = Array.isArray(data && data.players) ? data.players.filter(p => p && refOf(p)) : [];
            total = Number(data && data.total) || players.length;
            /* A page past the end (30 Sept 2026) — the only player on page
               two forgotten, or the list shrunk under a filter — came back
               empty with no pager, so no Previous, and Refresh asked for the
               same page again. Step back to the last page there is, and ask
               once more. */
            if (!players.length && skip > 0 && !stepped) {
                const last = total > 0 ? Math.floor((total - 1) / PAGE) * PAGE : 0;
                skip = last < skip ? last : 0;
                return load(true);
            }
            counts = (data && data.counts) || {};
            if (has(counts.all)) setBadge(counts);
            loadedAt = Date.now();
            loadError = null;
            // Stale details go: a row re-read means its detail is re-read.
            if (openRef && !players.some(p => refOf(p) === openRef)) openRef = null;
            if (openRef) loadDetail(openRef);
        } catch (err) {
            if (gen !== loadGen) return;
            loadError = sessionGone(err) ? "your session expired. Sign in again, then press Refresh." : errText(err);
        } finally {
            if (gen === loadGen && refreshBtn) refreshBtn.disabled = false;
        }
        render();
    }

    async function loadDetail(ref) {
        if (typeof Api.getPlayer !== "function") return;
        // The Moderation block's ban ids (see playerBans), when stale.
        if (canWrite() && (!bansList || Date.now() - bansAt > STALE_MS)) loadBans();
        const readNo = (detailReads.get(ref) || 0) + 1;
        detailReads.set(ref, readNo);
        const writesAt = detailWrites.get(ref) || 0;
        const mine = sessionNo;
        /* A newer read owns the answer, and will draw it. A write since
           this read started means the answer predates it: read again,
           fresh, rather than draw the old state or leave the detail
           without its activity (takeWrite only has the player's fields). */
        const stale = () => {
            if (mine !== sessionNo) return true;
            if (detailReads.get(ref) !== readNo) return true;
            if ((detailWrites.get(ref) || 0) === writesAt) return false;
            if (openRef === ref) loadDetail(ref);
            return true;
        };
        try {
            const data = await Api.getPlayer(token(), ref);
            if (stale()) return;
            const p = data && data.player;
            if (!p) throw new Error("the server sent nothing for them");
            details.set(ref, p);
            detailErrors.delete(ref);
            // The list's copy follows what the detail says.
            const row = players.find(x => refOf(x) === ref);
            if (row) ["nick", "displayName", "nickLocked", "nickLockedBy", "nickLockedAt", "nickAsked", "nickAt", "nickFlag", "nickRejected", "nameClash", "mottoFlag", "mottoApproved", "habboGuess", "habbo", "name", "username", "avatar", "seenAt", "ban", "hasNetHash"].forEach(k => { row[k] = p[k]; });
        } catch (err) {
            if (mine !== sessionNo) return;
            if (sessionGone(err)) return;
            if (stale()) return;
            detailErrors.set(ref, err && err.status === 404 ? "they are no longer there (forgotten?)" : errText(err));
        }
        if (openRef === ref) render();
    }

    // ------------------------------------------------------------ writes

    function setBusy(on) {
        busy = on;
        // data-off: a button that is off for its own reason stays off.
        listEl.querySelectorAll(".pl-detail button.pl-write, .pl-detail button.pl-owner, .pl-nick-input").forEach(b => { b.disabled = on || b.hasAttribute("data-off"); });
    }

    function takeWrite(ref, player) {
        if (!player) return;
        // Any detail read still out is now older than this (see detailReads).
        detailWrites.set(ref, (detailWrites.get(ref) || 0) + 1);
        const prev = details.get(ref) || {};
        details.set(ref, Object.assign({}, prev, player, { activity: prev.activity }));
        const row = players.find(x => refOf(x) === ref);
        if (row) ["nick", "displayName", "nickLocked", "nickLockedBy", "nickLockedAt", "nickAsked", "nickAt", "nickFlag", "nickRejected", "nameClash", "mottoFlag", "mottoApproved", "habboGuess", "habbo"].forEach(k => { row[k] = player[k]; });
    }

    async function write(p, change, okText) {
        if (busy || !canWrite() || !p.id) return false;
        if (typeof Api.updatePlayer !== "function") { flash("Not available yet — reload the page.", true); return false; }
        const ref = refOf(p);
        const mine = sessionNo;
        setBusy(true);
        say(ref, "Saving…");
        // Taken before the write: takeWrite updates p in place when it is the list row.
        const had = { nick: !!p.nick, locked: !!p.nickLocked, flagged: !!p.nickFlag, clash: !!p.nameClash, motto: mottoWaiting(p), habbo: habboWaiting(p) };
        try {
            const res = await Api.updatePlayer(token(), Object.assign({ id: p.id }, change));
            if (mine !== sessionNo) return false;
            takeWrite(ref, res && res.player);
            if (Object.prototype.hasOwnProperty.call(change, "nick")) nickDrafts.delete(ref);
            // Counts on the strip may have moved (a nickname, a lock, a flag).
            const now = details.get(ref) || {};
            if (has(counts.nick)) counts.nick += (now.nick ? 1 : 0) - (had.nick ? 1 : 0);
            if (has(counts.locked)) counts.locked += (now.nickLocked ? 1 : 0) - (had.locked ? 1 : 0);
            if (has(counts.clash)) counts.clash = Math.max(0, counts.clash + (now.nameClash ? 1 : 0) - (had.clash ? 1 : 0));
            if (has(counts.motto)) counts.motto = Math.max(0, counts.motto + (mottoWaiting(now) ? 1 : 0) - (had.motto ? 1 : 0));
            if (has(counts.habbo)) counts.habbo = Math.max(0, counts.habbo + (habboWaiting(now) ? 1 : 0) - (had.habbo ? 1 : 0));
            if (has(counts.waiting)) counts.waiting = Math.max(0, counts.waiting + (now.nickFlag || now.nameClash || mottoWaiting(now) || habboWaiting(now) ? 1 : 0) - (had.flagged || had.clash || had.motto || had.habbo ? 1 : 0));
            if (has(counts.flagged)) {
                counts.flagged = Math.max(0, counts.flagged + (now.nickFlag ? 1 : 0) - (had.flagged ? 1 : 0));
                setBadge(counts);
            }
            setBusy(false);
            render();
            say(ref, okText);
            return true;
        } catch (err) {
            if (mine !== sessionNo) return false;
            setBusy(false);
            if (sessionGone(err)) { say(ref, "Not saved: your session had expired. Sign in, then try again.", true); return false; }
            /* A review's 409 (29 Sept 2026) is the player having changed
               their nickname since this was loaded: its own sentence, and
               the detail read again so the new name is what is on screen. */
            /* And a motto review's 409 (5 Oct 2026, the bug scan): the motto
               changed, or another admin dealt with it, since this was
               loaded. It was worded as a nickname clash. The server's own
               words, and the detail read again. */
            if (err && err.status === 409 && (Object.prototype.hasOwnProperty.call(change, "motto") || Object.prototype.hasOwnProperty.call(change, "habboGuess") || (err.data && err.data.changed))) {
                const text = "Not saved: " + errText(err);
                say(ref, text, true);
                // Said again once the re-read has redrawn the detail.
                loadDetail(ref).then(() => say(ref, text, true));
                return false;
            }
            const msg = err && err.status === 409 ? "That nickname is taken by another player." : errText(err);
            say(ref, "Not saved: " + msg, true);
            return false;
        }
    }

    function writeNick(p, raw) {
        const nick = String(raw || "").normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
        const ref = refOf(p);
        if (!nick) { if (p.nick) clearNick(p); else say(ref, "Type a nickname first.", true); return; }
        if (nick === (p.nick || "")) { say(ref, "That's already their nickname."); return; }
        if ([...nick].length > NICK_MAX) { say(ref, `Nicknames can be at most ${NICK_MAX} characters.`, true); return; }
        write(p, { nick }, `Saved. The boards show them as ${nick} now (within about half a minute).`);
    }

    async function clearNick(p) {
        if (!p.nick) return;
        const ok = await ask(`Remove <strong>${escapeHtml(p.nick)}</strong>? They come off the boards until they have a nickname again.${p.nickLocked ? "" : " They can choose a new nickname themselves unless you lock it."}`);
        if (!ok) return;
        write(p, { nick: null }, "Removed. They're off the boards until they have a nickname again.");
    }

    // `opts` goes on to AdminConfirm — { danger: true } for the red Yes.
    async function ask(html, opts) {
        if (typeof window.AdminConfirm === "function") return window.AdminConfirm(html, opts);
        const div = document.createElement("div");
        div.innerHTML = html;
        return confirm(div.textContent);
    }

    // ------------------------------------------------------------ forget
    /* Owner only, here and on the server (player-forget.js answers 403 to
       anyone else). Two steps on purpose, as it always was: the dry run
       says what would go, then a separate button behind the page's own
       Are You Sure? does it. */

    const FORGET_LABELS = {
        "players": "Player account (name and picture)",
        "player_state": "Saved progress (walked and saved mazes)",
        "guess_scores": "Guess the Maze scores",
        "daily_scores": "Daily game scores",
        "daily_starts": "Daily game start times",
        "daily_practised": "Launch-day practice notes",
        "daily_resets": "Daily game reset tickets",
        "ff_scores": "Fallin' Furni leaderboard entries",
        "ff_tournament": "Fallin' Furni tournament entries",
        "ff_run_tokens": "Fallin' Furni run tokens",
        "ff_runs": "Fallin' Furni runs",
        "pura_scores": "Pura Panic leaderboard entries",
        "pura_run_tokens": "Pura Panic run tokens",
        "dead_end_upload_quotas": "Missing Pieces upload counters",
        "event_entry_quotas": "Event entry upload counters",
        "dead_end_leads.from": "Missing Pieces submissions (name removed, kept)",
        "dead_end_leads.sender": "Missing Pieces submissions (sender link removed, kept)",
        "dead_end_uploads.playerId": "Missing Pieces screenshots (uploader removed, kept)",
        "contact_messages.from": "Contact messages (name removed, kept)",
        "bans.playerId": "Network bans (player link removed, ban kept)",
        "event_entries.from": "Event entries (account removed, entry kept)",
        "event_entries.sender": "Event entries (sender key removed)",
        "notifications.to": "Console notifications sent to them (taken off)"
    };
    /* player-forget.js reports counts by where they are kept (its PLACES);
       said plainly here. A key this list does not know yet is still shown,
       tidied, rather than dropped — an unlisted count is exactly the one
       worth seeing. */
    function forgetLabel(key) {
        if (Object.prototype.hasOwnProperty.call(FORGET_LABELS, key)) return FORGET_LABELS[key];
        const words = String(key).replace(/[._]+/g, " ").trim();
        return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Other records";
    }
    function countsHtml(c) {
        const rows = Object.entries(c && typeof c === "object" ? c : {})
            .map(([key, n]) => [forgetLabel(key), Math.max(0, Number(n) || 0)])
            .filter(([, n]) => n > 0);
        if (!rows.length) return '<p class="admin-hint">Nothing else is stored under this player.</p>';
        return `<ul class="pl-counts">${rows.map(([label, n]) =>
            `<li><span>${escapeHtml(label)}</span> <strong>${escapeHtml(n.toLocaleString("en-GB"))}</strong></li>`).join("")}</ul>`;
    }
    /* `kept` (30 Sept 2026): player-forget.js leaves a ban on the account in
       force — a forgotten troll stays banned — and says how many, apart from
       the counts, so the list above never claims a ban is deleted.

       Nor that a credit goes (30 Sept 2026). The name a Missing Pieces lead
       was publicly credited to (dead_end_leads.credited) is public
       attribution the admins manage, and the owner decided a forget leaves
       it alone — so this no longer says "everything", and says so. */
    function forgetConfirmHtml(p, c, kept) {
        const list = Object.entries(c && typeof c === "object" ? c : {})
            .filter(([, n]) => Number(n) > 0)
            .map(([key, n]) => `${escapeHtml(forgetLabel(key))} (${escapeHtml(Number(n).toLocaleString("en-GB"))})`);
        const bans = Number(kept && kept.bans) || 0;
        return `This permanently deletes or unlinks what the site keeps about <strong>${escapeHtml(shownOf(p))}</strong>` +
            ` (Discord ID ${escapeHtml(p.id)})${list.length ? ": " + list.join(", ") : ""}. It can't be undone.` +
            (bans ? ` Bans on their account stay in force (${escapeHtml(bans.toLocaleString("en-GB"))}).` : "") +
            ` Public credits for Missing Pieces submissions stay as they are.`;
    }
    function forgetErrorText(err) {
        const status = err && err.status;
        if (status === 403) return "Only the owner can forget a player.";
        if (status === 404) return "Nothing is stored for them any more — they may already have been forgotten.";
        return (err && err.message) || "Something went wrong. Nothing was changed.";
    }

    async function forgetLook(p) {
        if (!isOwner() || !p.id) return;
        if (typeof Api.forgetPlayerPreview !== "function") { flash("Not available yet — reload the page.", true); return; }
        const ref = refOf(p);
        forgets.set(ref, { state: "looking" });
        render();
        try {
            const data = await Api.forgetPlayerPreview(token(), p.id);
            if (!forgets.has(ref)) return;
            forgets.set(ref, { state: "shown", data });
        } catch (err) {
            if (sessionGone(err)) { forgets.delete(ref); return; }
            if (!forgets.has(ref)) return;
            forgets.set(ref, { state: "idle", error: forgetErrorText(err) });
        }
        if (openRef === ref) render();
    }

    async function forgetGo(p) {
        const ref = refOf(p);
        const f = forgets.get(ref);
        if (!f || f.state !== "shown" || busy || !isOwner()) return;
        if (!(await ask(forgetConfirmHtml(p, f.data && f.data.counts, f.data && f.data.kept), { danger: true }))) return;
        // Cancelled, cleared or signed out while the dialog was up.
        if (forgets.get(ref) !== f) return;
        if (typeof Api.forgetPlayer !== "function") { flash("Not available yet — reload the page.", true); return; }
        const mine = sessionNo;
        setBusy(true);
        try {
            const data = await Api.forgetPlayer(token(), p.id);
            if (mine !== sessionNo) return;
            forgets.delete(ref);
            details.delete(ref);
            nickDrafts.delete(ref);
            players = players.filter(x => refOf(x) !== ref);
            total = Math.max(0, total - 1);
            if (has(counts.all)) counts.all = Math.max(0, counts.all - 1);
            if (p.nickFlag && has(counts.flagged)) counts.flagged = Math.max(0, counts.flagged - 1);
            if (p.nameClash && has(counts.clash)) counts.clash = Math.max(0, counts.clash - 1);
            if (mottoWaiting(p) && has(counts.motto)) counts.motto = Math.max(0, counts.motto - 1);
            if ((p.nickFlag || p.nameClash || mottoWaiting(p)) && has(counts.waiting)) counts.waiting = Math.max(0, counts.waiting - 1);
            if (has(counts.all)) setBadge(counts);
            if (p.nick && has(counts.nick)) counts.nick = Math.max(0, counts.nick - 1);
            if (p.nickLocked && has(counts.locked)) counts.locked = Math.max(0, counts.locked - 1);
            openRef = null;
            setBusy(false);
            render();
            // The last one on a later page: load() steps back a page.
            if (!players.length && skip > 0) load();
            const n = Object.values((data && data.counts) || {}).reduce((s, v) => s + (Number(v) || 0), 0);
            flash(`Forgotten: ${shownOf(p)} (Discord ID ${p.id}). ${num(n)} ${n === 1 ? "record" : "records"} removed or unlinked.`);
        } catch (err) {
            if (mine !== sessionNo) return;
            setBusy(false);
            if (sessionGone(err)) return;
            forgets.set(ref, Object.assign({}, f, { error: forgetErrorText(err) }));
            render();
        }
    }

    /* LOOK UP, the owner's box under the list: anyone by Discord id, name
       or @username, including somebody with scores but no players row. The
       old Admins-tab section, with the same two steps. */
    function renderForget() {
        if (!forgetEl) return;
        const show = isOwner() && apiReady();
        forgetEl.hidden = !show;
        if (!show) { if (forgetEl.childElementCount) clearLookup(); return; }
        if (forgetEl.childElementCount) return;
        forgetEl.innerHTML = `
            <h3 class="admin-subheading admin-subheading-spaced">Forget someone not in the list</h3>
            <p class="admin-hint">For a player with scores on a board but no sign-in record above. Look them up first to see exactly what would go &mdash; nothing is removed until you confirm. Everyone in the list can be forgotten from their own row.</p>
            <form class="admin-form is-open pl-forget-form" novalidate>
                <label class="admin-field">
                    <span>Discord ID or name</span>
                    <input type="text" name="q" maxlength="64" autocomplete="off" placeholder="A Discord ID, a name, or @username" spellcheck="false" autocapitalize="off">
                </label>
                <div class="admin-form-actions">
                    <button type="submit" class="admin-action-pill admin-pill-solid">Look up</button>
                </div>
                <p class="admin-form-error" role="alert" hidden></p>
            </form>
            <div class="chrome-list pl-forget-result" aria-live="polite" data-crumb-private></div>`;
    }

    function lookSay(text) {
        const el = forgetEl.querySelector(".pl-forget-form .admin-form-error");
        if (!el) return;
        el.textContent = text || "";
        el.hidden = !text;
    }
    function lookResult(html) {
        const el = forgetEl.querySelector(".pl-forget-result");
        if (el) el.innerHTML = html;
    }
    function clearLookup() {
        lookGen++;
        lookShown = null;
        if (!forgetEl) return;
        const form = forgetEl.querySelector(".pl-forget-form");
        if (form) form.reset();
        lookResult("");
        lookSay("");
    }

    function lookPreviewHtml(q, data) {
        const p = data && data.player;
        const whoLine = x => `${x.username ? "@" + escapeHtml(x.username) + " · " : ""}Discord ID ${escapeHtml(x.id)}`;
        if (p && p.id) {
            return `
                <div class="chrome-list-row admin-row pl-forget-player">
                    ${faceHtml(p, "pl-face")}
                    <div class="row-info">
                        <h3>${escapeHtml(p.nick || p.name || p.username || "Unnamed player")}</h3>
                        <p class="row-creator">${p.nick && p.name ? `Discord ${escapeHtml(p.name)} · ` : ""}${whoLine(p)}</p>
                        <p class="admin-hint">Forgetting them removes:</p>
                        ${countsHtml(data.counts)}
                    </div>
                    <div class="admin-row-actions">
                        <button type="button" class="btn admin-delete-btn" data-look-go>Forget this player</button>
                    </div>
                </div>`;
        }
        const matches = Array.isArray(data && data.matches) ? data.matches.filter(m => m && m.id) : [];
        if (matches.length) {
            return `<p class="admin-hint">More than one player answers to "${escapeHtml(q)}". Choose one to see what would be removed:</p>` +
                /* The nickname first (29 Sept 2026): player-forget.js's
                   matches carry `nick` now, and a name looked up from a
                   board IS the nickname — with only Discord names shown,
                   three matches for "Chris" could not be told apart. The
                   Discord name follows it, beside the @username and ID
                   whoLine already gives, so the account is recognisable. */
                matches.map(m => `
                <div class="chrome-list-row admin-row">
                    <div class="row-info">
                        <h3>${escapeHtml(m.nick || m.name || m.username || "Unnamed player")}</h3>
                        <p class="row-creator">${m.nick && m.name ? `Discord ${escapeHtml(m.name)} · ` : ""}${whoLine(m)}</p>
                    </div>
                    <div class="admin-row-actions">
                        <button type="button" class="btn" data-look-pick="${escapeHtml(m.id)}">Choose</button>
                    </div>
                </div>`).join("");
        }
        return `<p class="admin-empty">No player found for "${escapeHtml(q)}".</p>`;
    }

    async function lookUp(q) {
        const gen = ++lookGen;
        lookShown = null;
        lookSay("");
        lookResult("");
        if (!q) { lookSay("Type a Discord ID or a name."); return; }
        if (typeof Api.forgetPlayerPreview !== "function") { lookSay("This page is out of date. Reload it to use this."); return; }
        lookResult('<p class="admin-empty">Looking…</p>');
        try {
            const data = await Api.forgetPlayerPreview(token(), q);
            if (gen !== lookGen) return;
            lookResult(lookPreviewHtml(q, data));
            if (data && data.player && data.player.id) lookShown = { player: data.player, counts: data.counts || {} };
        } catch (err) {
            if (gen !== lookGen) return;
            lookResult("");
            if (sessionGone(err)) return;
            if (err && err.status === 404) { lookResult(lookPreviewHtml(q, null)); return; }
            lookSay(err && err.status === 400 ? (err.message || "Type a Discord ID or a name.") : forgetErrorText(err));
        }
    }

    async function lookGo() {
        const shown = lookShown;
        if (!shown || busy) return;
        const p = shown.player;
        if (!(await ask(forgetConfirmHtml({ id: p.id, displayName: p.nick || p.name || p.username }, shown.counts, shown.kept), { danger: true }))) return;
        if (lookShown !== shown) return;
        const gen = ++lookGen;
        const btn = forgetEl.querySelector("[data-look-go]");
        if (btn) { btn.disabled = true; btn.textContent = "Forgetting…"; }
        try {
            const data = await Api.forgetPlayer(token(), p.id);
            if (gen !== lookGen) return;
            lookShown = null;
            lookResult(`<p class="admin-empty" role="status">Forgotten: ${escapeHtml(p.nick || p.name || p.username || "Unnamed player")} (Discord ID ${escapeHtml(p.id)}). Removed:</p>${countsHtml(data && data.counts)}`);
            const field = forgetEl.querySelector('.pl-forget-form [name="q"]');
            if (field) field.value = "";
            // They may have been in the list after all.
            if (players.some(x => x.id === p.id)) load();
        } catch (err) {
            if (gen !== lookGen) return;
            if (btn) { btn.disabled = false; btn.textContent = "Forget this player"; }
            if (sessionGone(err)) return;
            lookSay(forgetErrorText(err));
        }
    }

    if (forgetEl) {
        forgetEl.addEventListener("submit", e => {
            if (!e.target.closest(".pl-forget-form")) return;
            e.preventDefault();
            const field = e.target.querySelector('[name="q"]');
            lookUp(field ? field.value.trim() : "");
        });
        forgetEl.addEventListener("click", e => {
            const pick = e.target.closest("[data-look-pick]");
            if (pick) {
                const field = forgetEl.querySelector('.pl-forget-form [name="q"]');
                if (field) field.value = pick.dataset.lookPick;
                lookUp(pick.dataset.lookPick);
                return;
            }
            if (e.target.closest("[data-look-go]")) lookGo();
        });
    }

    // --------------------------------------------------------------- CSV

    /* The rows on screen, as a spreadsheet. Every cell is quoted, and one
       that starts like a formula (= + - @, or a tab or return) is given a
       leading apostrophe: these names are typed by strangers, and a name
       like =HYPERLINK(...) is otherwise run by the spreadsheet that opens
       the file. */
    function csvCell(v) {
        let s = v == null ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }
    function csvText(list) {
        const cols = [
            ["Shown as", p => shownOf(p)],
            ["Nickname", p => p.nick || ""],
            ["Discord display name", p => p.name || ""],
            ["Discord username", p => p.username || ""],
            [list.some(p => p.id) ? "Discord ID" : "Reference", p => p.id || p.ref || ""],
            ["First signed in (UTC)", p => p.joinedAt || ""],
            ["Last signed in (UTC)", p => p.seenAt || ""],
            ["Nickname prompt seen", p => (p.nickAsked ? "yes" : "no")],
            ["Nickname locked", p => (p.nickLocked ? "yes" : "no")],
            ["Nickname flagged", p => (p.nickFlag ? `${p.nickFlag.reason || ""}: ${p.nickFlag.word || ""}` : "")],
            ["Nickname rejected", p => (p.nickRejected ? "yes" : "no")],
            ["Ban", p => (p.ban ? `${p.ban.level || ""} ${p.ban.kind === "nethash" ? "network" : "account"}${p.ban.until ? " until " + p.ban.until : " permanent"}` : "")],
            ["Daily games played", p => (p.activity && has(p.activity.dailyDays) ? p.activity.dailyDays : "")],
            ["Daily points", p => (p.activity && has(p.activity.dailyPoints) ? p.activity.dailyPoints : "")],
            ["Fallin' Furni best", p => (p.activity && p.activity.ffBest ? p.activity.ffBest.points : "")],
            ["Missing Pieces sent", p => (p.activity && has(p.activity.leads) ? p.activity.leads : "")]
        ];
        const lines = [cols.map(c => csvCell(c[0])).join(",")];
        list.forEach(p => lines.push(cols.map(c => csvCell(c[1](p))).join(",")));
        return lines.join("\r\n") + "\r\n";
    }
    function exportCsv() {
        if (!players.length) return;
        // A byte-order mark, so Excel reads the accents as UTF-8.
        const blob = new Blob(["\ufeff" + csvText(players)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `maze-rats-players-${new Date(nowMs()).toISOString().slice(0, 10)}${skip ? "-from-" + (skip + 1) : ""}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        flash(`Exported the ${num(players.length)} ${players.length === 1 ? "player" : "players"} on screen.`);
    }
    if (exportBtn) exportBtn.addEventListener("click", exportCsv);

    async function copyText(text, btn) {
        let ok = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
        } catch (e) { /* the fallback below */ }
        if (!ok) {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            ta.remove();
        }
        if (btn) {
            const was = btn.textContent;
            btn.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(() => { btn.textContent = was; }, 1400);
        }
    }

    if (refreshBtn) refreshBtn.addEventListener("click", () => load());

    // ------------------------------------------------------------ showing

    function onShownChange() {
        if (panel.hidden || !token()) return;
        if (!loadedAt || Date.now() - loadedAt > STALE_MS || loadError) load();
        else render();
    }
    new MutationObserver(onShownChange).observe(panel, { attributes: true, attributeFilter: ["hidden"] });

    // The badge: everybody who has signed in, read once the Warren opens.
    async function badge() {
        if (!token() || !navCount || !apiReady()) return;
        if (loadedAt) return;
        try {
            const data = await Api.getPlayers(token(), { limit: 1 });
            if (data && data.counts && has(data.counts.all)) setBadge(data.counts);
        } catch (e) { /* the panel says so when opened */ }
    }
    const rail = document.getElementById("admin-rail");
    if (rail) {
        const once = new MutationObserver(() => {
            if (rail.style.display !== "none") { once.disconnect(); badge(); }
        });
        once.observe(rail, { attributes: true, attributeFilter: ["style"] });
        if (rail.style.display !== "none") { once.disconnect(); badge(); }
    }

    /* Everything the last account read, gone: admin.js calls this on log
       out and when somebody else signs in. A list of Discord identities is
       not for whoever sits down next. */
    function reset() {
        loadGen++;
        sessionNo++;
        filter = "all";
        query = "";
        sort = "seen";
        skip = 0;
        players = [];
        total = 0;
        counts = {};
        loadedAt = 0;
        loadError = null;
        openRef = null;
        details.clear();
        detailErrors.clear();
        nickDrafts.clear();
        forgets.clear();
        banDrafts.clear();
        banEdits.clear();
        modMsgs.clear();
        bansGen++;
        bansList = null;
        bansAt = 0;
        bansError = "";
        busy = false;
        filtersBuilt = false;
        filtersEl.innerHTML = "";
        listEl.innerHTML = "";
        summaryEl.innerHTML = "";
        pagerEl.innerHTML = "";
        if (forgetEl) { forgetEl.innerHTML = ""; forgetEl.hidden = true; }
        clearLookup();
        if (updatedEl) updatedEl.textContent = "";
        setBadge(0);
        if (!token()) return;
        onShownChange();
        badge();
    }

    /* A lock-out (the twelve-hour session ran out): the list stays under
       the sign-in box, as every panel's does, but anything the owner looked
       up to forget is cleared, as it was in the Admins tab. */
    function clearPrivate() {
        forgets.clear();
        clearLookup();
        if (!panel.hidden && players.length) render();
    }

    // admin.js knows the role now, or it changed: redraw what depends on it.
    function roleChanged() {
        if (!isOwner()) { forgets.clear(); clearLookup(); }
        if (!panel.hidden && (players.length || loadError)) render();
        else renderForget();
    }

    /* The Bans tab changed something (29 Sept 2026): the rows' chips, the
       Banned count and this panel's ban list are out of date. Read again
       now if the panel is showing, or the next time it is. */
    function bansChanged() {
        bansAt = 0;
        loadedAt = 0;
        if (!panel.hidden && token()) { load(); loadBans(); }
    }

    window.AdminPlayers = { reset, clearPrivate, roleChanged, bansChanged };
    // For tools/ and the console: the pure parts, testable without a server.
    window.AdminPlayers._test = { csvText, csvCell, forgetLabel, countsHtml, forgetConfirmHtml, lookPreviewHtml, rowHtml, activityHtml, historyHtml, chipsHtml, reviewHtml, flagText, setBadge, moderationHtml };

    onShownChange();
})();

/* ===========================================================
   Maze Rats — the What's New panel in /warren  (4 Oct 2026, the owner's)

   What's New on the homepage is drawn from the archive itself (js/home.js,
   whatsNewItems): every maze, event and published guide on the day it was
   added or last edited, with a line of what changed. This panel shows that
   same log and lets an admin

     ADD   site news (a title, a few lines and an optional link)
           and notes about a maze or event (a line that opens it);
     AMEND any automatic entry: take it off the log, file it under another
           day, label it Added or Updated whatever the dates say, or give it
           its own line instead of the automatic one;
     POST  any entry to the Maze Rats Discord, by hand, one at a time (28 Oct
           2026): netlify/functions/whats-new-discord.js. The row says when
           it last went, and posting it again asks first. (Posting on its
           own was tried on 30 Oct 2026 and taken out the same day, the
           owner's: by hand only.)

   And since 2 Nov 2026 each published ARTICLE has an entry of its own,
   its fields set in the article (the Articles section above the log,
   js/admin-articles.js): Edit opens it, Hide and Show set its wn.hidden,
   Discord posts it as "article:<id>".

   Both are kept by netlify/functions/whats-new.js, and js/home.js applies
   them when it builds the log (WHAT'S NEW, BY HAND there). The days here
   are worked out as the homepage works them out, near enough: the
   homepage files by the reader's own day, this by the UTC one, so an edit
   made around midnight can sit a day apart in the two.

   A file of its own, like js/admin-guides.js: it shares the session token,
   Api's authenticated fetch and admin.js's question and sign-in boxes, and
   nothing else.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="whatsnew"]');
    if (!panel || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const URL_ = "/.netlify/functions/whats-new";
    const DISCORD_URL = "/.netlify/functions/whats-new-discord";
    // The day every record catalogued before createdAt existed shares
    // (ARCHIVE_BACKFILL_DATE in js/home.js).
    const BACKFILL = "2026-08-21";

    const listEl = panel.querySelector("#wn-list");
    const formEl = panel.querySelector("#wn-form");
    const searchEl = panel.querySelector("#wn-search");
    const hiddenEl = panel.querySelector("#wn-show-hidden");

    /* The automatic change lines, as the homepage words them (CHANGE_WORDS
       in js/home.js), so an override's placeholder shows what it replaces. */
    const CHANGE_WORDS = {
        "imagery-added": "Added room imagery", "imagery": "Room imagery updated", "thumb": "Thumbnail updated",
        "furni": "Updated furni listing", "markers": "Entrance or finish updated", "status": "Status changed",
        "difficulty": "Difficulty re-rated", "tags": "Tags updated", "dates": "Dates updated", "links": "Links updated",
        "text": "Changes made to texts", "details": "Details updated", "sections": "Sections rewritten", "images": "Pictures updated"
    };
    // And Article (2 Nov 2026): an article's entry, its fields set in the article (js/admin-articles.js).
    const VERBS = { added: "Added", updated: "Updated", news: "News", note: "Note", article: "Article" };

    let mounted = false;
    let rooms = [], events = [], guides = [], posts = [], overrides = new Map();
    let discord = new Map();    // key -> when it was last posted to Discord
    let posting = null;         // the key on its way to Discord now
    let openOverride = null;    // the target whose override editor is open
    let overrideDraft = null;   // what is typed in it, kept across redraws
    let overrideOpened = "";    // those fields as it was opened, for "unsaved changes?"
    let overrideBase = null;    // the updatedAt it was opened on; a save over a newer one is refused
    let editing = null;         // the post in the form ({} for a new one)
    let editingBase = null;     // the updatedAt it was opened on, as overrideBase
    let opened = "";            // editing as it was opened, for "unsaved changes?"
    const uploaded = new Set(); // news/ picture keys uploaded during this edit
    let busy = false;
    let logReady = false;       // the log has been read (2 Nov 2026): the articles' changes redraw it only then
    let lastRead = 0;           // when the log's own rows were last read
    const refreshedIds = new Set(); // mazes and events only a Refresh has seen (see archiveFrom)

    const refreshBtn = panel.querySelector("#wn-refresh");
    const updatedEl = panel.querySelector("#wn-updated");
    // Opening the tab re-reads at most this often; Refresh always does.
    const RE_READ_MS = 60 * 1000;

    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const token = () => {
        if (typeof window.AdminToken === "function") return window.AdminToken() || "";
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    };
    const call = (url, method, body) => Api._write(url, method, token(), body);
    const ask = (html, opts) => (typeof window.AdminConfirm === "function" ? window.AdminConfirm(html, opts) : Promise.resolve(false));
    const tell = text => (typeof window.AdminAlert === "function" ? window.AdminAlert(esc(text)) : Promise.resolve());
    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") window.AdminLockOut();
        return true;
    }

    const dayOf = v => String(v || "").slice(0, 10);
    const today = () => new Date().toISOString().slice(0, 10);
    function dayLabel(day) {
        const d = new Date(day + "T12:00:00Z");
        return isNaN(d) ? day : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }

    // ------------------------------------------------------------ the log

    // One automatic entry, before anything here changes it.
    function autoEntry(item, kind) {
        const isGuide = kind === "guide";
        const archived = String((isGuide ? item.publishedAt : item.createdAt) || BACKFILL);
        const updated = item.updatedAt ? String(item.updatedAt) : "";
        const activity = updated && dayOf(updated) > dayOf(archived) ? "updated" : "added";
        const words = (Array.isArray(item.changes) ? item.changes : []).map(k => CHANGE_WORDS[k]).filter(Boolean).join(" · ");
        return {
            target: `${kind}:${item.id}`,
            kind,
            name: kind === "event" ? item.title : isGuide ? item.title : item.name,
            meta: kind === "event" ? `Event${item.host ? " · " + item.host : ""}`
                : isGuide ? `Guide${item.category ? " · " + item.category : ""}`
                : `Maze${item.creator ? " · " + item.creator : ""}`,
            autoDay: dayOf(activity === "updated" ? updated : archived),
            autoActivity: activity,
            autoText: activity === "updated" ? words : ""
        };
    }

    // Everything on the log, as it will read, newest first.
    function entries() {
        const auto = [
            ...rooms.map(r => autoEntry(r, "maze")),
            ...events.map(e => autoEntry(e, "event")),
            ...guides.filter(g => g && g.status === "published" && g.publishedAt).map(g => autoEntry(g, "guide"))
        ].map(e => {
            const o = overrides.get(e.target) || null;
            return {
                ...e, o,
                day: (o && o.day) || e.autoDay,
                activity: (o && o.activity) || e.autoActivity,
                line: (o && o.text) || e.autoText,
                hidden: !!(o && o.hidden)
            };
        });
        const byTarget = new Map(auto.map(e => [e.target, e]));
        const own = posts.map(p => ({
            post: p,
            target: "",
            name: p.kind === "news" ? p.title : (byTarget.get(p.target) || {}).name || p.target,
            meta: p.kind === "news" ? "Site news" : (byTarget.get(p.target) || {}).meta || "Gone from the archive",
            day: p.day,
            // Its chosen label (27 Oct 2026): another word's colour, or the kind's for words of your own.
            activity: p.badge && p.badge !== "custom" ? p.badge : p.kind,
            verb: p.badge === "custom" && p.badgeText ? p.badgeText : "",
            line: p.text,
            hidden: p.hidden === true
        }));
        return auto.concat(own, articleEntries()).sort((a, b) => b.day.localeCompare(a.day) || String(a.name).localeCompare(String(b.name)));
    }

    /* The published articles' entries (2 Nov 2026), as the homepage draws
       them (articleLogItems in js/home.js): each article's own What's New
       fields, set in its editor, each empty for the article's own. */
    function articleEntries() {
        const list = window.AdminArticles ? window.AdminArticles.list() : [];
        return list.filter(a => a && a.status === "published" && a.publishedAt).map(a => {
            const wn = a.wn && typeof a.wn === "object" ? a.wn : {};
            const borrowed = ["added", "updated", "news", "note"].includes(wn.badge) ? wn.badge : "";
            return {
                article: a,
                target: "",
                name: wn.title || a.title,
                meta: `Article${a.author ? ` · by ${a.author}` : ""}`,
                day: /^\d{4}-\d{2}-\d{2}$/.test(wn.day || "") ? wn.day : dayOf(a.publishedAt),
                activity: borrowed || "article",
                verb: wn.badge === "custom" && wn.badgeText ? wn.badgeText : "",
                line: wn.text || GuideText.plain(a.summary || ""),
                hidden: wn.hidden === true
            };
        });
    }
    // The Discord key and the row's own for an entry of any kind.
    const keyOfEntry = e => (e.post ? `post:${e.post.id}` : e.article ? `article:${e.article.id}` : e.target);

    function render() {
        /* The open Amend box is read first and drawn back as typed, with the
           caret where it was: a search keystroke, a re-read or another row's
           button redraws the list, and that used to throw the typing away. */
        captureOverride();
        const active = document.activeElement;
        const focusKey = active && listEl.contains(active) && active.dataset ? active.dataset.ov : "";
        const caret = focusKey && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
        const q = (searchEl.value || "").trim().toLowerCase();
        const showHidden = hiddenEl.checked;
        const list = entries().filter(e => (showHidden || !e.hidden)
            && (!q || `${e.name} ${e.meta} ${e.line}`.toLowerCase().includes(q)));
        if (!list.length) {
            listEl.innerHTML = `<p class="admin-empty">${q ? "Nothing matches that." : "Nothing on What's New yet."}</p>`;
            return;
        }
        const days = [];
        list.forEach(e => {
            const last = days[days.length - 1];
            if (!last || last.day !== e.day) days.push({ day: e.day, items: [e] });
            else last.items.push(e);
        });
        listEl.innerHTML = days.map(g => `
            <h4 class="wn-day">${esc(dayLabel(g.day))}</h4>
            ${g.items.map(rowHtml).join("")}`).join("");
        if (focusKey) {
            const box = listEl.querySelector(`.wn-override [data-ov="${focusKey}"]`);
            if (box) {
                box.focus({ preventScroll: true });
                if (caret) try { box.setSelectionRange(caret[0], caret[1]); } catch (e) { /* no caret in a date or a list */ }
            }
        }
    }

    /* This entry's post, if it has gone (30 Oct 2026). The row is per record,
       so a maze posted when it was added is not "posted" again on a later
       day's Updated entry: that one is due in its turn. The day it went for
       is kept on the row (`day`); older rows have only the day they went. */
    function postedFor(e, key) {
        const d = discord.get(key);
        if (!d || e.post) return d || null;
        return (d.day || dayOf(d.postedAt)) >= e.day ? d : null;
    }

    function rowHtml(e) {
        const flags = [];
        if (e.o) {
            if (e.o.hidden) flags.push("hidden");
            if (e.o.day) flags.push("date moved");
            if (e.o.activity) flags.push("label set");
            if (e.o.text) flags.push("own text");
        }
        const key = keyOfEntry(e);
        const posted = postedFor(e, key);
        return `
            <div class="chrome-list-row admin-row wn-row${e.hidden ? " is-hidden" : ""}" data-key="${esc(key)}">
                <div class="row-info">
                    <h3><span class="wn-verb is-${esc(e.activity)}">${esc(e.verb || VERBS[e.activity] || "Added")}</span> ${esc(e.name || "(untitled)")}</h3>
                    <p class="row-creator">${esc(e.meta)}${flags.length ? ` <span class="wn-flags">Changed here: ${esc(flags.join(", "))}</span>` : ""}${posted ? ` <span class="wn-flags">Posted to Discord ${esc(shortDay(posted.postedAt))}</span>` : ""}</p>
                    ${e.line ? `<p class="row-creator wn-line">${esc(e.line)}</p>` : ""}
                </div>
                <div class="admin-row-actions">
                    ${e.article
                        // An article's entry: its What's New fields are edited in the article (2 Nov 2026).
                        ? `<button type="button" class="btn admin-edit-btn" data-wn="edit-article" aria-label="Edit the article ${esc(e.name || "")}">Edit</button>
                           <button type="button" class="btn admin-edit-btn" data-wn="toggle-article">${e.hidden ? "Show" : "Hide"}</button>`
                    : e.post
                        ? `<button type="button" class="btn admin-edit-btn" data-wn="edit-post">Edit</button>
                           <button type="button" class="btn admin-edit-btn" data-wn="toggle-post">${e.hidden ? "Show" : "Hide"}</button>
                           <button type="button" class="btn admin-delete-btn" data-wn="delete-post">Delete</button>`
                        : `<button type="button" class="btn admin-edit-btn" data-wn="amend">${openOverride === e.target ? "Close" : "Amend"}</button>
                           <button type="button" class="btn admin-edit-btn" data-wn="toggle-hide">${e.hidden ? "Show" : "Hide"}</button>`}
                    ${e.hidden ? "" : posting === key
                        // Going now (30 Oct 2026, the bug scan): Discord can take seconds to answer.
                        ? `<button type="button" class="btn admin-edit-btn" data-wn="discord" disabled aria-label="Posting ${esc(e.name || "(untitled)")} to Discord">Posting…</button>`
                        // Named, so a screen reader hears more than "Discord" on every row (30 Oct 2026).
                        : `<button type="button" class="btn admin-edit-btn" data-wn="discord" aria-label="Post ${esc(e.name || "(untitled)")} to Discord${posted ? " again" : ""}">${posted ? "Post again" : "Discord"}</button>`}
                </div>
            </div>
            ${!e.post && !e.article && openOverride === e.target ? overrideHtml(e) : ""}`;
    }

    // The editor for one automatic entry's override, under its row.
    function overrideHtml(e) {
        const o = overrideDraft || e.o || {};
        return `
            <div class="wn-override" data-for="${esc(e.target)}">
                <label class="admin-field"><span>Date (empty: automatic, ${esc(e.autoDay)})</span>
                    <input type="date" data-ov="day" value="${esc(o.day || "")}"></label>
                <label class="admin-field"><span>Label</span>
                    <select data-ov="activity">
                        <option value=""${!o.activity ? " selected" : ""}>Automatic (${esc(VERBS[e.autoActivity])})</option>
                        <option value="added"${o.activity === "added" ? " selected" : ""}>Added</option>
                        <option value="updated"${o.activity === "updated" ? " selected" : ""}>Updated</option>
                    </select></label>
                <label class="admin-field wn-wide"><span>Line under it (empty: automatic)</span>
                    <input type="text" maxlength="600" data-ov="text" value="${esc(o.text || "")}" placeholder="${esc(e.autoText || "Nothing, automatically")}"></label>
                <label class="admin-field wn-check"><input type="checkbox" data-ov="hidden"${o.hidden ? " checked" : ""}> Hidden from What's New</label>
                <p class="admin-form-error" data-ov-error style="display:none;"></p>
                <div class="admin-form-actions">
                    <button type="button" class="admin-action-pill admin-pill-solid" data-wn="save-override">Save</button>
                    ${e.o ? `<button type="button" class="admin-action-pill" data-wn="reset-override">Back to automatic</button>` : ""}
                    <button type="button" class="admin-action-pill admin-cancel-btn" data-wn="amend">Cancel</button>
                </div>
            </div>`;
    }

    // ------------------------------------------------------------ loading

    let loadGen = 0;
    /* `shared` (2 Nov 2026): the first opening takes the mazes and events
       js/admin.js read at sign-in (window.AdminArchiveCopy) rather than the
       whole archive again, ~3.7MB of it; nothing here reads their furni.
       Try again and Refresh read them afresh.
       `quiet`: the list stays up while it reads, and a read that fails leaves
       it there and says so beside Refresh. */
    async function load(shared, quiet) {
        const gen = ++loadGen;
        if (quiet !== true) listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        let copy = null;
        try { if (shared === true && typeof window.AdminArchiveCopy === "function") copy = await window.AdminArchiveCopy(); } catch (e) { /* read below */ }
        if (gen !== loadGen) return;
        // Asked afresh only when there is no copy to take: a re-read on opening the tab never fetches the archive.
        const keep = quiet === true && shared === true;
        try {
            const [r, ev, g, wn] = await Promise.all([
                copy ? copy.rooms : keep ? rooms : Api.getRoomsFull(token()),
                copy ? copy.events : keep ? events : Api.getEventsFull(token()),
                call("/.netlify/functions/guides?full=1", "GET").catch(() => guides),
                call(`${URL_}?full=1`, "GET")
            ]);
            if (gen !== loadGen) return;
            if (copy) {
                rooms = archiveFrom(Array.isArray(r) ? r : [], rooms);
                events = archiveFrom(Array.isArray(ev) ? ev : [], events);
            } else if (!keep) {
                rooms = Array.isArray(r) ? r : [];
                events = Array.isArray(ev) ? ev : [];
                noteRefreshed();
            }
            guides = Array.isArray(g) ? g : (g && Array.isArray(g.records) ? g.records : []);
            takeLog(wn);
            logReady = true;
            lastRead = Date.now();
            if (updatedEl) updatedEl.textContent = `Read ${new Date(lastRead).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })} UTC`;
            render();
            return !copy && !keep ? events : null;
        } catch (err) {
            if (gen !== loadGen) return;
            // Loaded again when next shown, after signing back in (5 Oct
            // 2026, the bug scan — it stayed on this line for good).
            if (sessionGone(err)) { mounted = false; listEl.innerHTML = '<p class="admin-empty">Sign in again to see What\'s New.</p>'; return; }
            if (quiet === true && logReady) {
                if (updatedEl) updatedEl.textContent = "Couldn't read it just now. This is the last copy.";
                return;
            }
            listEl.innerHTML = `<p class="admin-empty">Couldn't load What's New: ${esc(err.message)} <button type="button" class="ctl-btn" data-wn-retry>Try again</button></p>`;
            const retry = listEl.querySelector("[data-wn-retry]");
            if (retry) retry.addEventListener("click", () => load());
        }
    }
    function takeLog(wn) {
        posts = Array.isArray(wn && wn.posts) ? wn.posts : [];
        overrides = new Map((Array.isArray(wn && wn.overrides) ? wn.overrides : []).map(o => [o.target, o]));
        discord = new Map((Array.isArray(wn && wn.discord) ? wn.discord : []).map(d => [d.key, d]));
    }
    /* admin.js's copy is this Warren's own saves on top of what it read at
       sign-in, which is what makes a re-read free. A Refresh sees further: a
       maze another admin has added since is in no such copy, so the ones only
       a Refresh found are kept beside it, and of two copies of one record the
       later is drawn. Anything deleted here is in neither. */
    function archiveFrom(copy, had) {
        const was = new Map(had.map(x => [x.id, x]));
        const stamp = x => String((x && x.updatedAt) || "");
        const out = copy.map(x => {
            const other = was.get(x.id);
            return other && stamp(other) > stamp(x) ? other : x;
        });
        const have = new Set(out.map(x => x.id));
        had.forEach(x => { if (refreshedIds.has(x.id) && !have.has(x.id)) out.push(x); });
        return out;
    }
    function noteRefreshed() {
        refreshedIds.clear();
        const known = window.AdminArchiveCopy ? window.AdminArchiveCopy() : null;
        Promise.resolve(known).then(c => {
            if (!c) return;
            const inCopy = new Set([...c.rooms, ...c.events].map(x => x.id));
            [...rooms, ...events].forEach(x => { if (!inCopy.has(x.id)) refreshedIds.add(x.id); });
        }).catch(() => { /* none kept: the next re-read draws admin.js's copy */ });
    }

    // Everything the panel shows, afresh: the Refresh button.
    async function refreshAll() {
        if (!refreshBtn || refreshBtn.disabled) return;
        const text = refreshBtn.textContent;
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Reading…";
        try {
            const evs = await load(false, true);
            if (window.AdminArticles) await window.AdminArticles.refresh(evs);
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.textContent = text;
        }
    }

    // ------------------------------------------------------------ overrides

    /* A save over a newer copy is refused (netlify/functions/whats-new.js):
       the row then shows theirs, and what was typed stays in its box. `base`
       moves on to theirs, so pressing Save again is a knowing choice. */
    async function saveOverride(target, fields, base) {
        // Said, not silently ignored (4 Oct 2026, the bug scan).
        if (busy) { await tell("Still saving the last change. Try again in a moment."); return false; }
        busy = true;
        try {
            const res = await call(URL_, "PUT", { override: { target, ...fields, _baseUpdatedAt: base === undefined ? null : base } });
            if (res && res.override) overrides.set(target, res.override);
            else overrides.delete(target);
            return true;
        } catch (err) {
            if (err && err.status === 409 && err.data && err.data.conflict) {
                const now = err.data.current || null;
                if (now) overrides.set(target, now); else overrides.delete(target);
                if (openOverride === target) {
                    overrideBase = now ? now.updatedAt || null : null;
                    await tell("Someone else changed this entry since you opened it, so yours was not saved. What you typed is still in the box: press Save again to put yours over theirs, or Cancel to keep theirs.");
                } else {
                    await tell("Someone else changed this entry since this page read it, so nothing was changed. The row shows theirs now.");
                    render();
                }
                return false;
            }
            if (!sessionGone(err)) await tell(err.message || "That couldn't be saved.");
            return false;
        } finally {
            busy = false;
        }
    }

    function overrideFields(box) {
        const val = k => box.querySelector(`[data-ov="${k}"]`);
        return {
            day: val("day").value || "",
            activity: val("activity").value || "",
            text: val("text").value.trim(),
            hidden: val("hidden").checked
        };
    }
    // The open box as typed, into overrideDraft. A box filtered out by a search keeps what it had.
    function captureOverride() {
        if (!openOverride) return;
        const box = listEl.querySelector(`.wn-override[data-for="${CSS.escape(openOverride)}"]`);
        if (!box) return;
        const val = k => box.querySelector(`[data-ov="${k}"]`);
        overrideDraft = { day: val("day").value || "", activity: val("activity").value || "", text: val("text").value, hidden: val("hidden").checked };
    }
    const ovFields = o => JSON.stringify({ day: (o && o.day) || "", activity: (o && o.activity) || "", text: ((o && o.text) || "").trim(), hidden: !!(o && o.hidden) });
    function overrideDirty() {
        if (!openOverride) return false;
        captureOverride();
        return !!overrideDraft && ovFields(overrideDraft) !== overrideOpened;
    }
    function openOverrideBox(target) {
        const o = overrides.get(target) || null;
        openOverride = target;
        overrideDraft = null;
        overrideOpened = ovFields(o);
        overrideBase = o ? o.updatedAt || null : null;
    }
    function closeOverrideBox() {
        openOverride = null;
        overrideDraft = null;
        overrideOpened = "";
        overrideBase = null;
    }

    // ------------------------------------------------------------ discord

    const shortDay = iso => {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    };

    /* One entry to the Discord, as the row reads: its label, name and line.
       The server reads the rest (address, picture) from the record. Asked
       first, always, and said plainly when it has gone before. */
    async function postToDiscord(key) {
        const e = entries().find(x => keyOfEntry(x) === key);
        if (!e) return;
        const label = e.verb || VERBS[e.activity] || "Added";
        const before = postedFor(e, key);
        const again = before
            ? `<br><br><strong>It was posted on ${esc(shortDay(before.postedAt))}${before.count > 1 ? ` (${before.count} times so far)` : ""}.</strong> This posts it again.`
            : "";
        if (!await ask(`Post this to the Maze Rats Discord?<br><br><strong>${esc(label)}: ${esc(e.name || "(untitled)")}</strong>${e.line ? `<br>${esc(e.line)}` : ""}${again}`)) return;
        if (busy) { await tell("Still saving the last change. Try again in a moment."); return; }
        busy = true;
        // The row's button says Posting… and is off until Discord answers (30 Oct 2026).
        // Put right in place, not by render(), which would drop an open Amend box's typing.
        posting = key;
        const btn = () => listEl.querySelector(`.wn-row[data-key="${CSS.escape(key)}"] [data-wn="discord"]`);
        const was = btn();
        const wasText = was ? was.textContent : "", wasLabel = was ? was.getAttribute("aria-label") : "";
        if (was) { was.disabled = true; was.textContent = "Posting…"; was.setAttribute("aria-label", `Posting ${e.name || "(untitled)"} to Discord`); }
        try {
            const res = await call(DISCORD_URL, "POST", { key, activity: e.activity, label, line: e.line || "", day: e.day });
            if (res && res.discord) discord.set(key, res.discord);
            posting = null;
            render();
        } catch (err) {
            posting = null;
            const b = btn();
            if (b) { b.disabled = false; b.textContent = wasText; b.setAttribute("aria-label", wasLabel); }
            // A refusal (one already going from another tab, say) is said in the server's own words.
            if (!sessionGone(err)) await tell(err.message || "That couldn't be posted.");
        } finally {
            busy = false;
            posting = null;
        }
    }

    // ------------------------------------------------------------ posts

    /* A changed post is never thrown away without asking (4 Oct 2026, the
       bug scan): opening another post, starting a new one, or Cancel used to
       drop it — and delete any picture uploaded for it — without a word.
       True when there is nothing to lose, or the admin says to lose it. */
    function postDirty() {
        if (!editing) return false;
        readForm();
        return JSON.stringify(editing) !== opened;
    }
    async function mayDiscard() {
        if (!postDirty()) return true;
        return !!(await ask("Discard your unsaved changes to this post? Anything you have added or edited since opening it will be lost.", { danger: true }));
    }
    // And the Amend box's, the same question.
    async function mayCloseOverride() {
        if (!overrideDirty()) return true;
        return !!(await ask("Discard your unsaved changes to this entry? Anything you have added or edited since opening it will be lost.", { danger: true }));
    }

    async function openPost(p, kind) {
        if (!(await mayDiscard())) return;
        if (!(await mayCloseOverride())) return;
        if (editing) closePost();
        editing = p ? { ...p } : { kind: kind === "note" ? "note" : "news", day: today(), title: "", text: "", image: "", link: "", target: "" };
        editingBase = p ? p.updatedAt || null : null;
        // A post from before labels had none: the same as the kind's own, so opening one isn't a change.
        editing.badge = editing.badge || "";
        editing.badgeText = editing.badgeText || "";
        opened = JSON.stringify(editing);
        if (openOverride) { closeOverrideBox(); render(); }
        renderForm();
        formEl.classList.add("is-open");
        formEl.scrollIntoView({ behavior: "smooth", block: "start" });
        const first = formEl.querySelector("[data-p]");
        if (first) first.focus({ preventScroll: true });
    }
    /* Pictures uploaded during the edit and not kept by a save go: never
       one a saved post still points at (the server refuses to delete a
       picture any record or post uses, and that refusal is left alone). */
    function forget(keys) {
        keys.forEach(k => {
            Api.deleteImage(token(), k).catch(() => { /* in use, or gone: leave it */ });
        });
    }
    const keyOf = src => (typeof src === "string" && src.startsWith("/.netlify/functions/image?key=news/"))
        ? decodeURIComponent(src.slice("/.netlify/functions/image?key=".length)) : null;

    function closePost(keep) {
        if (editing) forget([...uploaded].filter(k => k !== keep));
        uploaded.clear();
        opened = "";
        editing = null;
        formEl.classList.remove("is-open");
        formEl.innerHTML = "";
    }

    function targetOptions(sel) {
        const opt = (kind, item, label) => {
            const v = `${kind}:${item.id}`;
            return `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(label)}</option>`;
        };
        const byName = (a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));
        const known = [...rooms.map(r => `maze:${r.id}`), ...events.map(e => `event:${e.id}`)];
        const gone = sel && !known.includes(sel)
            ? `<option value="${esc(sel)}" selected>${esc(sel)} (gone from the archive)</option>` : "";
        return `<option value="">Choose…</option>${gone}
            <optgroup label="Mazes">${rooms.slice().sort(byName).map(r => opt("maze", r, r.name || r.id)).join("")}</optgroup>
            <optgroup label="Events">${events.slice().sort(byName).map(e => opt("event", e, e.title || e.id)).join("")}</optgroup>`;
    }

    function renderForm() {
        const p = editing;
        const news = p.kind === "news";
        formEl.innerHTML = `
            <h3 class="admin-form-title">${p.id ? "Edit post" : news ? "New news post" : "New note"}</h3>
            <label class="admin-field"><span>Kind</span>
                <select data-p="kind">
                    <option value="news"${news ? " selected" : ""}>Site news</option>
                    <option value="note"${!news ? " selected" : ""}>A note about a maze or event</option>
                </select></label>
            <label class="admin-field"><span>Date (the day it's filed under)</span>
                <input type="date" data-p="day" value="${esc(p.day)}" required></label>
            <label class="admin-field"><span>Label</span>
                <select data-p="badge">
                    <option value=""${!p.badge ? " selected" : ""}>Automatic (${news ? "News" : "Note"})</option>
                    ${["added", "updated", "news", "note"].map(b => `<option value="${b}"${p.badge === b ? " selected" : ""}>${VERBS[b]}</option>`).join("")}
                    <option value="custom"${p.badge === "custom" ? " selected" : ""}>Your own words…</option>
                </select></label>
            ${p.badge === "custom" ? `
                <label class="admin-field"><span>Label says (14 characters at most)</span>
                    <input type="text" maxlength="14" data-p="badgeText" value="${esc(p.badgeText)}" placeholder="e.g. Fixed" required></label>` : ""}
            <p class="admin-hint wn-wide">The word in the box at the start of the entry. Your own words show in ${news ? "News" : "Note"}'s colour, in capitals.</p>
            ${news ? `
                <label class="admin-field wn-wide"><span>Title</span>
                    <input type="text" maxlength="120" data-p="title" value="${esc(p.title)}" required></label>
                <label class="admin-field wn-wide"><span>Text (optional, a few lines)</span>
                    <textarea rows="3" maxlength="600" data-p="text">${esc(p.text)}</textarea></label>
                <p class="admin-hint wn-wide">Every news post has the same picture: a piece of the maze on What's New, and the Maze Rats banner when it is posted to Discord.</p>
                <label class="admin-field"><span>Link (optional: /profile, /guides, /maze/…, or https://…)</span>
                    <input type="text" maxlength="400" data-p="link" value="${esc(p.link)}" placeholder="/profile"></label>`
            : `
                <label class="admin-field wn-wide"><span>Maze or event</span>
                    <select data-p="target" required>${targetOptions(p.target)}</select></label>
                <label class="admin-field wn-wide"><span>Note</span>
                    <textarea rows="3" maxlength="600" data-p="text" required>${esc(p.text)}</textarea></label>`}
            <p class="admin-form-error" data-p-error style="display:none;"></p>
            <div class="admin-form-actions">
                <button type="button" class="admin-action-pill admin-pill-solid" data-wn="save-post">Save</button>
                <button type="button" class="admin-action-pill admin-cancel-btn" data-wn="cancel-post">Cancel</button>
            </div>`;
    }

    // What's typed, kept on `editing` so a redraw (kind or label changed)
    // keeps it.
    function readForm() {
        formEl.querySelectorAll("[data-p]").forEach(el => { editing[el.dataset.p] = el.value; });
    }

    function formError(text) {
        const out = formEl.querySelector("[data-p-error]");
        if (!out) return;
        out.textContent = text || "";
        out.style.display = text ? "" : "none";
    }

    async function savePost() {
        if (busy) return;
        readForm();
        const p = editing;
        const body = { kind: p.kind, day: p.day, text: p.text || "", title: p.title || "", image: p.image || "", link: (p.link || "").trim(), target: p.target || "", hidden: p.hidden === true,
            badge: p.badge || "", badgeText: p.badge === "custom" ? (p.badgeText || "").trim() : "" };
        if (p.id) { body.id = p.id; body._baseUpdatedAt = editingBase; }
        busy = true;
        formError("");
        const saveBtn = formEl.querySelector('[data-wn="save-post"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
        try {
            const before = p.id ? posts.find(x => x.id === p.id) : null;
            const saved = await call(URL_, p.id ? "PUT" : "POST", body);
            posts = posts.filter(x => x.id !== saved.id).concat(saved);
            // The picture this post had before, if the save replaced it.
            const old = before && keyOf(before.image);
            closePost(keyOf(saved.image));
            if (old && old !== keyOf(saved.image)) forget([old]);
            render();
        } catch (err) {
            // The form stays open with everything typed in it, whatever went wrong.
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
            if (err && err.status === 409 && err.data && err.data.current) {
                posts = posts.filter(x => x.id !== err.data.current.id).concat(err.data.current);
                editingBase = err.data.current.updatedAt || null;
                render();
                formError("Someone else saved this post since you opened it, so yours was not saved. What you typed is still here: press Save again to put yours over theirs, or Cancel to keep theirs.");
            } else if (err && err.status === 404 && p.id) {
                posts = posts.filter(x => x.id !== p.id);
                render();
                formError("This post was deleted after you opened it, so it can't be saved. What you typed is still here: copy what you need, then Cancel.");
            } else if (!sessionGone(err)) {
                formError(err.message || "That couldn't be saved.");
            }
        } finally {
            busy = false;
        }
    }

    /* The news form's picture upload went (ebb778a8, 28 Oct 2026): every
       news post has the same picture now. upload() and its Remove button
       went with it (30 Oct 2026, the bug scan). A post saved before keeps
       its stored image, sent back unchanged on save, and Delete still
       clears a news/ picture it had. */

    // ------------------------------------------------------------ events

    listEl.addEventListener("click", async e => {
        const btn = e.target.closest("[data-wn]");
        if (!btn) return;
        const act = btn.dataset.wn;
        const row = btn.closest("[data-key]") || btn.closest("[data-for]");
        const key = row ? (row.dataset.key || row.dataset.for) : "";

        if (act === "amend") {
            if (!(await mayCloseOverride())) return;
            const opening = openOverride !== key;
            closeOverrideBox();
            if (opening) openOverrideBox(key);
            render();
            return;
        }
        if (act === "discord") { postToDiscord(key); return; }
        // An article's entry (2 Nov 2026): Edit opens the article; Hide and Show set its wn.hidden.
        if (act === "edit-article" || act === "toggle-article") {
            const id = key.replace(/^article:/, "");
            if (!window.AdminArticles) return;
            if (act === "edit-article") { window.AdminArticles.edit(id); return; }
            if (busy) { await tell("Still saving the last change. Try again in a moment."); return; }
            const a = window.AdminArticles.list().find(x => x.id === id);
            if (!a) return;
            busy = true;
            try {
                await window.AdminArticles.setHidden(id, !(a.wn && a.wn.hidden === true));
            } catch (err) {
                if (!sessionGone(err)) await tell(err.message || "That couldn't be saved.");
            } finally {
                busy = false;
            }
            render();
            return;
        }
        if (act === "toggle-hide") {
            const o = overrides.get(key) || {};
            /* This row's Amend box, if it is open, is saved as typed rather
               than thrown away by the redraw (4 Oct 2026, the bug scan). */
            const box = openOverride === key ? listEl.querySelector(`.wn-override[data-for="${CSS.escape(key)}"]`) : null;
            const fields = box ? overrideFields(box) : { day: o.day || "", activity: o.activity || "", text: o.text || "", hidden: !!o.hidden };
            fields.hidden = !o.hidden;
            const ok = await saveOverride(key, fields, box ? overrideBase : (o.updatedAt || null));
            if (ok) {
                // Its box, if open, now holds what was just saved.
                if (box) { overrideDraft = null; openOverrideBox(key); listEl.querySelectorAll(`.wn-override[data-for="${CSS.escape(key)}"]`).forEach(b => b.remove()); }
                render();
            }
            return;
        }
        if (act === "save-override" || act === "reset-override") {
            const box = btn.closest("[data-for]");
            const fields = act === "reset-override" ? { day: "", activity: "", text: "", hidden: false } : overrideFields(box);
            const ok = await saveOverride(key, fields, overrideBase);
            if (ok) { closeOverrideBox(); render(); }
            return;
        }
        if (act === "toggle-post") {
            // Hide or show one post on its own, as the automatic entries can be.
            const p = posts.find(x => x.id === key.replace(/^post:/, ""));
            if (!p || busy) return;
            busy = true;
            try {
                const saved = await call(URL_, "PUT", { ...p, hidden: !p.hidden, _baseUpdatedAt: p.updatedAt || null });
                posts = posts.filter(x => x.id !== saved.id).concat(saved);
                // This post open in the form: its copy takes the new stamp and tick, and stays unchanged if it was.
                if (editing && editing.id === saved.id) {
                    const clean = !postDirty();
                    editing.hidden = saved.hidden;
                    editing.updatedAt = saved.updatedAt;
                    editingBase = saved.updatedAt || null;
                    if (clean) opened = JSON.stringify(editing);
                    else { const was = JSON.parse(opened); was.hidden = saved.hidden; was.updatedAt = saved.updatedAt; opened = JSON.stringify(was); }
                }
                render();
            } catch (err) {
                if (err && err.status === 409 && err.data && err.data.current) {
                    posts = posts.filter(x => x.id !== err.data.current.id).concat(err.data.current);
                    render();
                    await tell("Someone else changed this post since this page read it, so nothing was changed. The row shows theirs now.");
                } else if (!sessionGone(err)) await tell(err.message || "That couldn't be saved.");
            } finally {
                busy = false;
            }
            return;
        }
        if (act === "edit-post" || act === "delete-post") {
            const id = key.replace(/^post:/, "");
            const p = posts.find(x => x.id === id);
            if (!p) return;
            if (act === "edit-post") { openPost(p); return; }
            const what = p.kind === "news" ? `the news post "${esc(p.title)}"` : "this note";
            if (!await ask(`Delete ${what}? It comes off What's New at once.`, { danger: true })) return;
            try {
                await call(`${URL_}?id=${encodeURIComponent(p.id)}`, "DELETE");
                posts = posts.filter(x => x.id !== p.id);
                if (keyOf(p.image)) forget([keyOf(p.image)]);
                render();
            } catch (err) {
                if (!sessionGone(err)) await tell(err.message || "That couldn't be deleted.");
            }
        }
    });

    formEl.addEventListener("click", e => {
        const btn = e.target.closest("[data-wn]");
        if (!btn) return;
        if (btn.dataset.wn === "save-post") savePost();
        else if (btn.dataset.wn === "cancel-post") mayDiscard().then(ok => { if (ok) closePost(); });
    });
    formEl.addEventListener("submit", e => { e.preventDefault(); savePost(); });
    formEl.addEventListener("change", e => {
        // A label of your own opens a box to type it in.
        if (e.target.matches('[data-p="kind"], [data-p="badge"]')) {
            readForm();
            renderForm();
            if (e.target.matches('[data-p="badge"]') && editing.badge === "custom") {
                const box = formEl.querySelector('[data-p="badgeText"]');
                if (box) box.focus();
            }
        }
    });

    // The articles' entries redraw the log when the Articles section has read or saved them (2 Nov 2026).
    if (window.AdminArticles) window.AdminArticles.onChange(() => { if (logReady) render(); });

    panel.querySelector("#wn-add-news").addEventListener("click", () => openPost(null));
    panel.querySelector("#wn-add-note").addEventListener("click", () => openPost(null, "note"));
    searchEl.addEventListener("input", render);
    hiddenEl.addEventListener("change", render);
    if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

    // ------------------------------------------------------------ mount

    /* Read on the first opening, and re-read on each opening after: a maze
       added since has to be on the log, with its Discord button. What it costs
       is small and capped: the mazes and events come from admin.js's copy, for
       nothing, and the log's own rows and the guides are read at most once a
       minute. No timer: a Warren left open reads nothing until it is looked at. */
    function maybeMount() {
        if (panel.hidden || !token()) return;
        if (!mounted) {
            mounted = true;
            load(true);
            return;
        }
        if (!logReady) return;
        if (Date.now() - lastRead >= RE_READ_MS) { load(true, true); return; }
        const shared = typeof window.AdminArchiveCopy === "function" ? window.AdminArchiveCopy() : null;
        Promise.resolve(shared).then(c => {
            if (!c || panel.hidden) return;
            rooms = archiveFrom(c.rooms, rooms);
            events = archiveFrom(c.events, events);
            render();
        }).catch(() => { /* the list stays as it is */ });
    }
    new MutationObserver(maybeMount).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    maybeMount();

    /* For admin.js, as js/admin-guides.js offers: reset() forgets the last
       account's list and edit, and loads again when next shown. */
    /* The Articles section's editor rides along (2 Nov 2026, js/admin-articles.js):
       an article half-written is asked about, closed and reset with the post. */
    const articlesEd = () => window.AdminArticles || null;
    window.AdminWhatsNew = {
        isDirty() {
            if (articlesEd() && articlesEd().isDirty()) return true;
            return postDirty() || overrideDirty();
        },
        close() {
            if (editing) closePost();
            if (openOverride) { closeOverrideBox(); if (logReady) render(); }
            if (articlesEd()) articlesEd().close();
        },
        reset() {
            if (articlesEd()) articlesEd().reset();
            loadGen++;
            // Another account's uploads are left, not deleted with this
            // one's token (as js/admin-guides.js leaves them).
            uploaded.clear();
            closePost();
            closeOverrideBox();
            rooms = []; events = []; guides = []; posts = []; overrides = new Map(); discord = new Map(); posting = null;
            logReady = false;
            lastRead = 0;
            refreshedIds.clear();
            if (updatedEl) updatedEl.textContent = "";
            listEl.innerHTML = "";
            mounted = false;
            maybeMount();
        }
    };
})();

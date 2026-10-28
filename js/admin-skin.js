/* The Warren's seasonal skins card (warren.html, between the SKINS:start and
   SKINS:end comments; styled in css/warren.css under .sk-card).

   REDESIGNED (25 Oct 2026, the owner's: "setting seasonal skin dates etc
   doesn't feel intuitive"). The first version asked everything at once — a
   preview, a mode, a list of date-and-time rows with years in them and an
   "every year" box that told you to ignore the years, a clock per row — and
   left you to work out how they fitted together. Now it asks three questions,
   in the order you would ask them yourself:

     1. WHAT VISITORS SEE. One choice: follow the dates, a skin by hand, or no
        skin. Saved the moment it is pressed, as the palette buttons are; the
        way back is the other button. A sentence under it says what the choice
        means, and the line at the top of the card says what visitors are
        seeing right now and what happens next.
     2. EACH SKIN'S DATES. One row per skin: a tick to put it in the
        calendar, the moment it COMES ON and the moment it GOES OFF (a day, a
        month and a time each — the times came back the same evening, the
        owner's "Time has been removed … :("), and the palette worn with
        it. Every year. One clock for the lot (each visitor's own, or one
        moment everywhere). Save and Discard appear only once something has
        changed.
     3. PREVIEW IT YOURSELF. Folded away under the rest: it is for checking
        a skin, not for running the site.

   THE SETTINGS ARE AS THEY WERE (netlify/functions/settings.js), so
   js/skin-wear.js reads them unchanged:
     skin          "auto" | "off" | "<name>"
     skinSchedule  [{ skin, from: "YYYY-MM-DDTHH:mm", to: …, zone, yearly,
                     theme?: <palette> | null }]
   A window's theme LEFT OUT means the skin's own default (js/skin-wear.js's
   PAIRED: Halloween wears Witching Hour, Christmas wears Frost); null
   means the site's own palette; a name is that palette. The
   palette picker offers all three, and a row on "Default" writes no theme
   at all, so a skin's default can change later without re-saving dates.
   A row here is a skin's yearly window, its "comes on" and "goes off" being
   the window's from and to exactly as they are stored. Its palette is worn
   with it while it is on (js/skin-wear.js); none means the site's own.
   Anything a row cannot show — a one-off window, a second window for the
   same skin — is kept exactly as it is and listed under its skin, with a
   Remove.

   The preview writes two keys in this browser's localStorage (PREVIEW_KEY,
   DATE_KEY: js/skin-wear.js's names — keep them in step), which nobody else
   ever sees.

   ADDING A SKIN means a row in SKINS below (its name is its data-skin
   value, and must also be in SKINS in js/skin-wear.js and VALID_SKINS in
   netlify/functions/settings.js). */
(function () {
    "use strict";
    const PREVIEW_KEY = "mazerats_skin_preview";
    const DATE_KEY = "mazerats_skin_preview_date";

    /* `on`/`off` are the moments offered when a skin is first ticked (it
       goes off AT `off`). `dates` are the "Pretend it's" days worth looking
       at. `dot` is its colour in the card. */
    const SKINS = [
        { name: "xmas", label: "Christmas", on: "12-01T00:00", off: "01-06T00:00", dot: "#9fd8ff", palette: "Frost",
          dates: [["12-01", "1 Dec"], ["12-12", "12 Dec"], ["12-24", "24 Dec"], ["12-25", "25 Dec"]] },
        // Nothing in the Halloween skin goes by the calendar yet; the night itself is here for when something does.
        { name: "halloween", label: "Halloween", on: "10-24T00:00", off: "11-01T00:00", dot: "#9cff5c", palette: "Witching Hour",
          dates: [["10-31", "31 Oct"]] }
    ];
    const skinOf = (name) => SKINS.find((s) => s.name === name);
    const labelOf = (name) => name === "none" ? "the normal site, with no skin," : (skinOf(name) || { label: name }).label;
    // The palettes a window can wear (VALID_THEMES in netlify/functions/settings.js).
    const THEMES = [["", "Site's own"], ["classic", "Classic"], ["purple", "Purple"], ["pumpkin", "Pumpkin"], ["witch", "Witching Hour"], ["crimson", "Crimson"], ["frost", "Frost"]];
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // February stops at the 28th: a yearly window is saved under this year's date, and most years have no 29th.
    const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    const $ = (id) => document.getElementById(id);
    const get = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
    const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private mode */ } };
    const el = (tag, props, kids) => {
        const n = document.createElement(tag);
        for (const k in props || {}) {
            if (k === "dataset") Object.assign(n.dataset, props[k]);
            else if (k === "style") n.style.cssText = props[k];
            else n[k] = props[k];
        }
        (kids || []).forEach((c) => c != null && n.append(c));
        return n;
    };
    const segBtn = (cls, attr, value, text) =>
        el("button", { type: "button", className: "btn-enter-mini " + cls, dataset: { [attr]: value }, textContent: text });

    // "MM-DD" <-> words.
    const pad = (n) => String(n).padStart(2, "0");
    const md = (m, d) => pad(m) + "-" + pad(d);
    const words = (mmdd) => +mmdd.slice(3) + " " + MONTHS[+mmdd.slice(0, 2) - 1];
    function fmt(t) {
        return new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    // ---------------- the state ----------------
    let site = { skin: "auto", skinSchedule: [] };   // as saved
    let loaded = false;
    let rows = {};          // per skin: { on, onAt: "MM-DDTHH:mm", offAt, theme: "default" | null | <palette>, kept: [windows a row cannot show] }
    let clock = "local";    // the zone the rows switch in
    let saved = "";         // the rows as last loaded or saved, to tell a change
    let modeError = "";     // why the switch's last save failed, said under it

    const token = () => (typeof window.AdminToken === "function" ? window.AdminToken() : "") || get("mazerats_admin_token");
    /* Whether this account may change the dates (26 Oct 2026, the bug scan):
       a view-only account could edit them and press Save, and was only
       refused by the server. As js/admin-players.js asks it: the role
       js/admin.js lends, else its body.is-viewer. The calendar is greyed for
       a viewer and the switch above already is (style.css's viewer list);
       the preview is this browser's alone and stays theirs to use. */
    function canWrite() {
        let r = "";
        try { r = typeof window.AdminRole === "function" ? String(window.AdminRole() || "") : ""; } catch (e) { r = ""; }
        if (r) return r === "owner" || r === "admin";
        return !document.body.classList.contains("is-viewer");
    }
    const editable = () => loaded && canWrite();

    /* The saved windows, as rows: a skin's first yearly window is its row;
       everything else about it is kept as it is. */
    function rowsFrom(schedule) {
        const out = {};
        SKINS.forEach((s) => { out[s.name] = { on: false, onAt: s.on, offAt: s.off, theme: "default", kept: [] }; });
        let zone = null;
        for (const w of schedule) {
            const r = out[w.skin];
            if (!r) continue;
            if (!r.on && w.yearly) {
                r.on = true;
                r.onAt = w.from.slice(5, 16);
                r.offAt = w.to.slice(5, 16);
                // No theme saved is the skin's default, which is not the same as null.
                r.theme = "theme" in w ? (w.theme || null) : "default";
                zone = zone || w.zone;
            } else {
                r.kept.push(Object.assign({}, w));
            }
        }
        clock = zone || (schedule[0] && schedule[0].zone) || "local";
        return out;
    }

    // The rows, as the windows the settings keep. Yearly windows ignore the
    // year, so this year's is as good as any (skin-wear.js reads it so).
    function scheduleFrom() {
        const y = new Date().getFullYear();
        const out = [];
        for (const s of SKINS) {
            const r = rows[s.name];
            if (r.on) {
                // Across New Year (on in December, off in January): the off is next year's.
                out.push({ skin: s.name, from: y + "-" + r.onAt, to: (r.offAt <= r.onAt ? y + 1 : y) + "-" + r.offAt,
                    zone: clock, yearly: true, ...(r.theme === "default" ? {} : { theme: r.theme || null }) });
            }
            r.kept.forEach((w) => out.push(Object.assign({}, w)));
        }
        return out;
    }
    const snapshot = () => JSON.stringify({ rows, clock });
    const changed = () => loaded && snapshot() !== saved;

    // ---------------- 1. what visitors see ----------------
    const MODE_HINTS = {
        auto: "Each skin comes on and goes off by itself, at the moments set below.",
        off: "No skin for anybody, whatever the dates below say. Your preview still works for you."
    };
    function paintModes() {
        const box = $("skin-site-modes");
        if (!box) return;
        if (!box.childElementCount) {
            box.append(segBtn("skin-site-btn", "skinSite", "auto", "Follow the dates"),
                ...SKINS.map((s) => segBtn("skin-site-btn", "skinSite", s.name, s.label)),
                segBtn("skin-site-btn", "skinSite", "off", "No skin"));
        }
        const mode = site.skin || "auto";
        box.querySelectorAll(".skin-site-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.skinSite === mode);
            b.setAttribute("aria-pressed", String(b.dataset.skinSite === mode));
            b.disabled = !editable();
        });
        const hint = $("skin-site-mode-hint");
        if (hint) {
            hint.textContent = modeError || MODE_HINTS[mode] ||
                labelOf(mode) + " is on for everybody now, whatever the dates say, until you choose something else here.";
            hint.classList.toggle("is-bad", Boolean(modeError));
        }
    }

    // The line at the top: what visitors see now, and what happens next.
    function paintNow() {
        const out = $("skin-site-now");
        if (!out) return;
        if (!loaded) { out.textContent = "Reading the settings…"; return; }
        const W = window.SkinWear;
        if (!W || !W.resolve) { out.textContent = ""; return; }
        const now = Date.now(), r = W.resolve(site, now);
        out.replaceChildren();
        out.classList.toggle("is-on", Boolean(r.skin));
        const head = el("strong", { textContent: r.skin ? "Visitors see " + labelOf(r.skin) : "Visitors see no skin" });
        let rest = "";
        if (r.why === "off") rest = ", because it is switched off.";
        else if (r.why === "override") rest = ", switched on by hand.";
        else if (r.why === "schedule") rest = ", by its dates, until " + fmt(r.until) + ".";
        else {
            const next = W.nextChange(site, now);
            const then = next != null ? W.resolve(site, next + 1) : null;
            rest = then && then.skin ? ". Next: " + labelOf(then.skin) + " from " + fmt(next) + "." : ", and none is coming up.";
        }
        out.append(head, rest);
        const mine = get(PREVIEW_KEY);
        if (mine) out.append(el("span", { className: "sk-mine", textContent: "You are previewing " + labelOf(mine) + " in this browser." }));
    }

    // ---------------- 2. each skin's dates ----------------
    function dayMonth(value, onChange, label) {
        const m0 = +value.slice(0, 2), d0 = +value.slice(3);
        const day = el("select", { className: "ctl-input sk-day" });
        const month = el("select", { className: "ctl-input sk-month" },
            MONTHS.map((n, i) => el("option", { value: String(i + 1), textContent: n, selected: i + 1 === m0 })));
        const fillDays = (keep) => {
            const max = DAYS_IN[+month.value - 1];
            day.replaceChildren(...Array.from({ length: max }, (_, i) =>
                el("option", { value: String(i + 1), textContent: String(i + 1), selected: i + 1 === Math.min(keep, max) })));
        };
        fillDays(d0);
        day.setAttribute("aria-label", label + " day");
        month.setAttribute("aria-label", label + " month");
        const report = () => onChange(md(+month.value, +day.value));
        month.addEventListener("change", () => { fillDays(+day.value); report(); });
        day.addEventListener("change", report);
        return el("span", { className: "sk-dm" }, [day, month]);
    }

    // A moment in the year: day and month, and a time.
    function moment(value, onChange, label) {
        let cur = value.slice(0, 5);
        const time = el("input", { type: "time", className: "ctl-input sk-time", value: value.slice(6, 11), step: 60, required: true });
        time.setAttribute("aria-label", label + " time");
        const report = () => onChange(cur + "T" + (time.value || "00:00"));
        const dm = dayMonth(cur, (v) => { cur = v; report(); }, label);
        time.addEventListener("change", () => {
            // A time put back in takes Save's "Set a time" (below) away with it.
            const need = time.nextElementSibling;
            if (time.value && need && need.classList.contains("sk-need")) { need.remove(); time.removeAttribute("aria-invalid"); time.removeAttribute("aria-describedby"); }
            report();
        });
        return el("span", { className: "sk-moment" }, [dm, el("span", { className: "sk-word", textContent: "at" }), time]);
    }

    // A row's palette: worn with the skin while its dates are on.
    function themePick(r, s, changed) {
        const choices = [["default", "Default (" + s.palette + ")"]].concat(THEMES);
        const now = r.theme === "default" ? "default" : (r.theme || "");
        const pick = el("select", { className: "ctl-input sk-theme", title: "The palette worn with the skin while its dates are on" },
            choices.map(([v, t]) => el("option", { value: v, textContent: t, selected: v === now })));
        pick.setAttribute("aria-label", s.label + " palette");
        pick.addEventListener("change", () => { r.theme = pick.value === "default" ? "default" : (pick.value || null); r.on = true; changed(); });
        return pick;
    }

    // Minutes into a (leap) year, so two moments can be compared and counted.
    const minuteOf = (at) => (Date.UTC(2024, +at.slice(0, 2) - 1, +at.slice(3, 5), +at.slice(6, 8), +at.slice(9, 11)) - Date.UTC(2024, 0, 1)) / 60000;
    const YEAR_MIN = 366 * 24 * 60;
    function lengthOf(r) {
        let m = minuteOf(r.offAt) - minuteOf(r.onAt);
        if (m <= 0) m += YEAR_MIN;
        const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
        return [d && d + (d === 1 ? " day" : " days"), h && h + " h", mm && mm + " min"].filter(Boolean).join(" ");
    }

    function keptWords(w) {
        const when = (s) => {
            const [date, time] = s.split("T");
            const dd = words(date.slice(5));
            return (w.yearly ? dd : dd + " " + date.slice(0, 4)) + (time !== "00:00" ? " " + time : "");
        };
        return (w.yearly ? "Every year " : "Once, ") + when(w.from) + " until " + when(w.to) + (w.zone === "utc" ? " (UTC)" : "");
    }

    function paintCal() {
        const cal = $("skin-cal");
        if (!cal) return;
        cal.replaceChildren(...SKINS.map((s) => {
            const r = rows[s.name];
            /* A change to a row puts it right IN PLACE (26 Oct 2026). Every
               change used to draw the whole calendar again, so the control
               being used was thrown away under the hand: typing a time,
               Chrome reports each figure as a change, and "14" went in as
               01:00 with the focus gone; a keyboard user lost their place
               after every pick. Only the tick, the greying and the length
               depend on the rest, so only they are touched. */
            const sync = () => {
                tick.checked = r.on;
                range.classList.toggle("is-off", !r.on);
                len.textContent = r.on ? "On for " + lengthOf(r) : "Not in the calendar";
                paintSave();
            };
            const tick = el("input", { type: "checkbox", checked: r.on, disabled: !editable() });
            tick.addEventListener("change", () => { r.on = tick.checked; sync(); });
            const name = el("label", { className: "sk-name" }, [tick,
                el("span", { className: "sk-dot", style: "--sk-dot:" + s.dot }), s.label]);
            // A line each: comes on, goes off, then the palette and how long.
            const line = (lead, kids) => el("div", { className: "sk-line" }, [el("span", { className: "sk-word sk-lead", textContent: lead }), ...kids]);
            const len = el("span", { className: "sk-len" });
            const range = el("div", { className: "sk-range" }, [
                line("Comes on", [moment(r.onAt, (v) => { r.onAt = v; r.on = true; sync(); }, s.label + " comes on")]),
                line("Goes off", [moment(r.offAt, (v) => { r.offAt = v; r.on = true; sync(); }, s.label + " goes off")]),
                line("Palette", [themePick(r, s, sync), len])
            ]);
            range.classList.toggle("is-off", !r.on);
            len.textContent = r.on ? "On for " + lengthOf(r) : "Not in the calendar";
            // Changing a moment ticks the skin (above): choosing its times is putting it in.
            range.querySelectorAll("select, input").forEach((x) => { x.disabled = !editable(); });
            const kept = r.kept.map((w, i) => {
                const rm = el("button", { type: "button", className: "ctl-btn sk-rm", textContent: "Remove", disabled: !editable() });
                rm.addEventListener("click", () => { r.kept.splice(i, 1); paintCal(); paintSave(); });
                return el("p", { className: "sk-kept" }, [el("span", { textContent: "Also: " + keptWords(w) }), rm]);
            });
            // Under the palette: the skin's own switch, saved at once (gooLine).
            if (s.name === "halloween") range.append(gooLine(line));
            return el("div", { className: "sk-row", dataset: { skin: s.name } }, [name, range, ...kept]);
        }));

        const box = $("skin-clock");
        if (box) {
            const opt = (value, text) => {
                const r = el("input", { type: "radio", name: "skin-clock", value, checked: clock === value, disabled: !editable() });
                r.addEventListener("change", () => { clock = value; paintSave(); });
                return el("label", { className: "sk-radio" }, [r, text]);
            };
            box.replaceChildren(el("span", { className: "sk-word", textContent: "The times are" }),
                opt("local", "each visitor's own"), opt("utc", "UTC, the same moment for everyone"));
        }
    }

    /* THE HALLOWEEN GOO (28 Oct 2026, the owner's: "an option … to remove all
       goo/slime"). One tick, saved the moment it changes, as the switch above
       is: it is not a date, so it does not wait for the dates' Save. Off, the
       skin keeps its bats, ghost, cobwebs, moon and palette, with no goo,
       drips or splats anywhere (halloweenGoo in netlify/functions/settings.js;
       pages already open follow on their next settings read). */
    function gooLine(line) {
        const tick = el("input", { type: "checkbox", checked: site.halloweenGoo !== false, disabled: !editable() });
        const note = el("span", { className: "sk-len" });
        tick.addEventListener("change", async () => {
            const want = tick.checked;
            tick.disabled = true;
            const ok = await save({ halloweenGoo: want }, "", (m, bad) => { note.textContent = m; note.classList.toggle("is-bad", Boolean(bad)); });
            tick.checked = site.halloweenGoo !== false;
            tick.disabled = !editable();
            if (ok) { note.classList.remove("is-bad"); note.textContent = want ? "Goo on" : "No goo anywhere"; }
        });
        return line("Goo", [el("label", { className: "sk-radio" }, [tick, "Goo, slime and drips"]), note]);
    }

    // Two skins on at once: the first in the list wins (skin-wear.js takes
    // the first window that covers the moment), which is worth saying.
    function overlapWarning() {
        const on = SKINS.filter((s) => rows[s.name].on);
        const covers = (r, at) => {
            const a = minuteOf(r.onAt), b = minuteOf(r.offAt), x = minuteOf(at);
            return a < b ? x >= a && x < b : x >= a || x < b;
        };
        for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
            const a = rows[on[i].name], b = rows[on[j].name];
            if (covers(a, b.onAt) || covers(b, a.onAt)) return on[i].label + " and " + on[j].label + " are on at the same time for a while; " + on[i].label + " is shown then.";
        }
        return "";
    }

    function say(text, bad) {
        const s = $("skin-sched-status");
        if (!s) return;
        s.textContent = text || "";
        s.classList.toggle("is-bad", Boolean(bad));
    }

    function paintSave() {
        const dirty = changed();
        const save = $("skin-cal-save"), discard = $("skin-cal-discard");
        if (save) { save.hidden = !dirty; save.disabled = !editable(); }
        if (discard) { discard.hidden = !dirty; discard.disabled = !editable(); }
        if (loaded && !canWrite()) { say("This account is view-only: it can see the dates, but not change them."); return; }
        const warn = overlapWarning();
        if (dirty) say(warn ? "Unsaved changes. " + warn : "Unsaved changes.");
        else if (warn) say(warn);
        else if (!/^(Dates saved|Saving|Couldn|Sign in)/.test(($("skin-sched-status") || {}).textContent || "")) say("");
    }

    // ---------------- 3. preview it yourself ----------------
    function paintPreview() {
        const skins = $("skin-preview-skins"), dates = $("skin-preview-dates");
        if (!skins || !dates) return;
        const mine = get(PREVIEW_KEY), date = get(DATE_KEY);
        // "Normal site" (27 Oct 2026, the owner's): no skin, the site's own palette — see NO_SKIN in js/skin-wear.js.
        skins.replaceChildren(segBtn("skin-preview-btn", "skinPreview", "", "Off"),
            segBtn("skin-preview-btn", "skinPreview", "none", "Normal site"),
            ...SKINS.map((s) => segBtn("skin-preview-btn", "skinPreview", s.name, s.label)));
        // Pressed or not, said as well as lit, as the switch above says it (26 Oct 2026).
        skins.querySelectorAll("button").forEach((b) => { b.classList.toggle("active", b.dataset.skinPreview === mine); b.setAttribute("aria-pressed", String(b.dataset.skinPreview === mine)); });
        const chosen = skinOf(mine);
        const pretend = $("skin-pretend");
        if (pretend) pretend.hidden = !chosen || !chosen.dates.length;
        dates.replaceChildren(segBtn("skin-date-btn", "skinDate", "", "Today"),
            ...(chosen ? chosen.dates : []).map(([v, t]) => segBtn("skin-date-btn", "skinDate", v, t)));
        dates.querySelectorAll("button").forEach((b) => { b.classList.toggle("active", b.dataset.skinDate === date); b.setAttribute("aria-pressed", String(b.dataset.skinDate === date)); });
        // Open while a preview is on, so it is never on without being seen.
        const box = $("skin-preview-box");
        if (box && mine) box.open = true;
        paintNow();
    }

    // ---------------- reading and saving ----------------
    function take(s) {
        site = { skin: s.skin || "auto", skinSchedule: Array.isArray(s.skinSchedule) ? s.skinSchedule : [], halloweenGoo: s.halloweenGoo !== false };
    }

    async function load() {
        try {
            const res = await fetch("/.netlify/functions/settings?fresh=" + Date.now(), { cache: "no-store" });
            // A database blip answers 503 with an error body: read as settings, that was "no schedule",
            // and the next Save would have written over every stored window.
            if (!res.ok) throw new Error("settings " + res.status);
            take(await res.json());
            rows = rowsFrom(site.skinSchedule);
            saved = snapshot();
            loaded = true;
        } catch (e) {
            say("Couldn't read the settings. Reload to try again.", true);
        }
        paintModes(); paintNow(); paintCal(); paintSave();
    }

    /* `tell` is where it says how it went: the dates' own status line, or,
       for the switch (`tell` null), under the switch and only if it failed —
       a switch that worked says so itself, lit gold, with its sentence under
       it and the line at the top of the card changed. */
    async function save(update, done, tell) {
        const t = token();
        const fail = (m) => { if (tell) tell(m, true); else { modeError = m; } };
        if (!t) { fail("Sign in first."); paintModes(); return false; }
        if (tell) tell("Saving…");
        modeError = "";
        try {
            take(await Api.updateSiteSettings(t, update));
            if (tell) tell(done);
            return true;
        } catch (e) {
            fail((e && e.message) || "Couldn't save. Try again.");
            return false;
        } finally {
            paintModes(); paintNow();
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const card = $("skin-preview-card");
        if (!card) return;
        rows = rowsFrom([]);

        $("skin-site-modes").addEventListener("click", (e) => {
            const b = e.target.closest(".skin-site-btn");
            if (!b || !loaded || b.dataset.skinSite === (site.skin || "auto")) return;
            save({ skin: b.dataset.skinSite }, "", null);
        });
        $("skin-cal-save").addEventListener("click", async () => {
            if (!editable()) return;
            /* A time field left empty (cleared, or half typed) was saved as
               00:00 while it showed nothing (26 Oct 2026, the bug scan). Now
               Save stops, says "Set a time" beside each empty one in a skin
               that is on, and goes to the first. */
            const blank = [...document.querySelectorAll("#skin-cal .sk-time")].filter((t) => {
                const row = t.closest(".sk-row");
                return !t.value && row && rows[row.dataset.skin] && rows[row.dataset.skin].on;
            });
            if (blank.length) {
                blank.forEach((t) => {
                    t.setAttribute("aria-invalid", "true");
                    if (t.nextElementSibling && t.nextElementSibling.classList.contains("sk-need")) return;
                    const need = el("span", { className: "sk-word sk-hint is-bad sk-need", textContent: "Set a time", id: "sk-need-" + Math.random().toString(36).slice(2, 8) });
                    t.setAttribute("aria-describedby", need.id);
                    t.after(need);
                });
                say("Some times are empty. Set them, then save.", true);
                blank[0].focus();
                return;
            }
            const bad = SKINS.filter((s) => rows[s.name].on && rows[s.name].onAt === rows[s.name].offAt);
            if (bad.length) { say(bad[0].label + " comes on and goes off at the same moment. To keep it on all year, choose it under What visitors see instead.", true); return; }
            if (await save({ skinSchedule: scheduleFrom() }, "Dates saved.", say)) {
                rows = rowsFrom(site.skinSchedule);
                saved = snapshot();
                paintCal(); paintSave();
            }
        });
        $("skin-cal-discard").addEventListener("click", () => {
            rows = rowsFrom(site.skinSchedule);
            saved = snapshot();
            say("");
            paintCal(); paintSave();
        });
        card.addEventListener("click", (e) => {
            const s = e.target.closest(".skin-preview-btn");
            const d = e.target.closest(".skin-date-btn");
            if (s) {
                // A date pretended for one skin means nothing to another.
                if (s.dataset.skinPreview !== get(PREVIEW_KEY)) put(DATE_KEY, "");
                put(PREVIEW_KEY, s.dataset.skinPreview);
            } else if (d) put(DATE_KEY, d.dataset.skinDate);
            else return;
            paintPreview();
        });
        addEventListener("storage", (e) => { if (e.key === PREVIEW_KEY || e.key === DATE_KEY) paintPreview(); });

        paintModes(); paintCal(); paintSave(); paintPreview();
        /* The role is known only once someone has signed in, and can change
           with the next sign-in: js/admin.js says so with body.is-viewer, so
           the card is greyed, or given back, when that class changes. */
        let viewer = document.body.classList.contains("is-viewer");
        new MutationObserver(() => {
            const now = document.body.classList.contains("is-viewer");
            if (now === viewer) return;
            viewer = now;
            paintModes(); paintCal(); paintSave();
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
        // The same arithmetic the public pages use, without wearing anything here.
        window.__skinWearPassive = true;
        const s = document.createElement("script");
        s.src = "/js/skin-wear.js?v=2";
        s.onload = paintNow;
        document.head.appendChild(s);
        load();
        // Keep "until …" and "Next: …" true on a Warren left open.
        setInterval(paintNow, 60 * 1000);
    });
})();

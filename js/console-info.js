/* ===========================================================
   Maze Rats — the console's Add Maze Info form and Missing Pieces list

   ADD MAZE INFO is how somebody tells the archive what they know about a
   maze or event: one that is in the archive and missing something, one
   that is in the archive and complete (there is always more to say), or
   one that is not in it at all — which is what the console's old "Submit
   a Maze" form was for, and why this replaced it.

   It is built as rows. Each row is one thing being added, chosen from a
   short list of actions ("Add room images", "Add builder") — see
   LEAD_KINDS in js/dead-ends.js — and only the input that action needs
   appears once it is chosen. "Add more" puts another row under it.

   MISSING PIECES lists every maze and event an admin has marked as
   missing something, with "I can help" on each, which opens the form
   already pointed at that record.

   Everything is sent to netlify/functions/dead-end-leads.js and read by a
   person in /warren before any of it reaches the archive. Images need a
   Discord sign-in (see that file for why) and go up one at a time before
   the submission itself — a function takes a 6MB body, and a few room
   screenshots do not fit in one.

   The archive's records and the marked flags come from js/home.js through
   window.MissingPieces; the page switching is js/console.js's, through
   window.MazeConsole. Everything here is set in Volter Goldfish like the
   rest of the console, which draws an em dash and a few other characters
   as pictures (PICTURE_GLYPHS in js/site.js), so none are used below.
   =========================================================== */
document.addEventListener("DOMContentLoaded", () => {
    const infoBody = document.getElementById("console-info-body");
    const missingBody = document.getElementById("console-missing-body");
    const Console = window.MazeConsole;
    if (!infoBody || !missingBody || !Console || typeof DeadEnds === "undefined") return;

    const LEADS_URL = "/.netlify/functions/dead-end-leads";
    const data = () => window.MissingPieces || null;

    function esc(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function signedIn() {
        return window.Account && Account.current ? Account.current : null;
    }

    /* ------------------------------------------------------ Missing Pieces */

    // One word per thing needed, each said once: entrance, finish and room
    // shots are all just "Images" to somebody deciding whether they can help.
    function pieceWords(keys) {
        const words = keys.map(k => {
            const p = DeadEnds.piece(k);
            return p ? (p.word || p.label) : k;
        });
        return [...new Set(words)].join(", ");
    }

    function missingShowing() {
        const page = document.getElementById("console-page-missing");
        return !!page && page.style.display === "block";
    }

    /* This used to call mp.ready().then(renderMissing) whenever the flags
       were not loaded. A failed flags read resolves ready() all the same,
       so it looped: fetch, fail, render, fetch, with no pause and whether
       or not the console was even open. Now it asks once, and a failure
       stays a failure (with a Retry button) until somebody asks again,
       by pressing Retry or opening the page. */
    let missingAsking = false;
    let flagsFailed = false;

    function renderMissing(opts) {
        const mp = data();
        if (!mp) {
            missingBody.innerHTML = '<p class="console-blurb">Loading...</p>';
            return;
        }
        if (!mp.loaded()) {
            const retry = opts && opts.retry;
            if (flagsFailed && !retry) {
                missingBody.innerHTML = `
                    <p class="console-blurb">The list couldn't be reached just now.</p>
                    <button type="button" class="console-btn" data-missing-retry>Retry</button>`;
                return;
            }
            missingBody.innerHTML = '<p class="console-blurb">Loading...</p>';
            if (missingAsking) return;
            missingAsking = true;
            mp.ready().then(() => {
                missingAsking = false;
                flagsFailed = !mp.loaded();
                // Drawn only if somebody is looking; opening the page
                // draws it (and asks again) otherwise.
                if (missingShowing()) renderMissing();
            });
            return;
        }
        flagsFailed = false;
        const list = mp.missing();
        if (!list.length) {
            missingBody.innerHTML = '<p class="console-blurb">Nothing is missing right now. Know something we don\'t? Use Add Maze Info.</p>';
            return;
        }
        missingBody.innerHTML = `
            <p class="console-blurb">These are missing something. Were you there? Add what you know.</p>
            ${list.map((r, i) => `
                ${i ? '<div class="console-dotline"></div>' : ""}
                <div class="console-missing-entry">
                    <button type="button" class="console-missing-name" data-open="${esc(r.type)}:${esc(r.id)}">${esc(r.name)}</button>
                    <p class="console-missing-needs">Needs: ${esc(pieceWords(r.pieces))}</p>
                    ${r.note ? `<p class="console-missing-note">${esc(r.note)}</p>` : ""}
                    ${r.waiting ? `<p class="console-missing-note">${esc(r.waiting)} ${r.waiting === 1 ? "lead" : "leads"} waiting to be read.</p>` : ""}
                    <button type="button" class="console-btn console-missing-help" data-help="${esc(r.type)}:${esc(r.id)}">I can help</button>
                </div>`).join("")}`;
    }

    missingBody.addEventListener("click", e => {
        if (e.target.closest("[data-missing-retry]")) { renderMissing({ retry: true }); return; }
        const help = e.target.closest("[data-help]");
        if (help) {
            const [type, ...rest] = help.dataset.help.split(":");
            openInfo({ type, id: rest.join(":") });
            return;
        }
        const open = e.target.closest("[data-open]");
        if (open && data()) {
            const [type, ...rest] = open.dataset.open.split(":");
            // The console paints at z-index 200, over the maze window's
            // overlay at 100, so the window opened BEHIND it. Close the
            // console first: its focus goes back to whatever opened it, and
            // the maze window then takes focus and remembers that as the
            // place to return to.
            Console.close();
            data().openRecord(type, rest.join(":"));
        }
    });

    /* ------------------------------------------------------- Add Maze Info */

    let target = null;          // { type, id } the form opened for, or null

    // archiveLoaded/archiveReady are newer than loaded/ready in js/home.js;
    // the fallbacks keep an old cached home.js working for a day.
    const archiveIn = mp => (mp.archiveLoaded ? mp.archiveLoaded() : mp.loaded());
    const archiveWait = mp => (mp.archiveReady ? mp.archiveReady() : mp.ready());

    function recordOptions(selected) {
        const mp = data();
        // The archive alone decides this list. It used to wait on loaded(),
        // which also needs the Missing Pieces flags, so a failed flags read
        // left the form with no mazes to choose.
        const records = mp && archiveIn(mp) ? mp.records() : [];
        const opt = (r) => {
            const v = `${r.type}:${r.id}`;
            return `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(r.name)}</option>`;
        };
        const mazes = records.filter(r => r.type === "maze");
        const events = records.filter(r => r.type === "event");
        return `
            <option value="">Choose one</option>
            <option value="new"${selected === "new" ? " selected" : ""}>A maze that isn't listed</option>
            ${mazes.length ? `<optgroup label="Mazes">${mazes.map(opt).join("")}</optgroup>` : ""}
            ${events.length ? `<optgroup label="Events">${events.map(opt).join("")}</optgroup>` : ""}`;
    }

    // The kind of record the form is about: "maze", "event" or "new". A form
    // with nothing chosen yet offers the maze list, the likeliest by far.
    function currentType() {
        const v = (document.getElementById("ci-record") || {}).value || "";
        if (v === "new") return "new";
        return v.startsWith("event:") ? "event" : "maze";
    }

    function kindOptions(type, selected) {
        return `<option value="">What are you adding?</option>` +
            DeadEnds.leadKindsFor(type).map(k =>
                `<option value="${k.key}"${k.key === selected ? " selected" : ""}>${esc(DeadEnds.leadKindLabel(k.key, type))}</option>`
            ).join("");
    }

    /* The input a chosen kind needs, and nothing until one is chosen. */
    function kindInputHtml(kindKey, type) {
        const k = DeadEnds.leadKind(kindKey);
        if (!k) return "";
        const ph = k.placeholder ? ` placeholder="${esc(k.placeholder)}"` : "";
        // Every input is named by its row's action ("Add builder"). Only the
        // image input used to be: the others had no accessible name at all,
        // since a placeholder is not one and the kind <select> above each
        // is a separate control.
        const name = ` aria-label="${esc(DeadEnds.leadKindLabel(kindKey, type))}"`;
        switch (k.input) {
            case "images":
                return signedIn()
                    ? `<input type="file" class="console-input console-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple aria-label="${esc(DeadEnds.leadKindLabel(kindKey, type))}">
                       <p class="console-note">PNG, JPG, GIF or WebP, 4MB each.</p>`
                    : `<p class="console-note" data-signin-note>Sign in with Discord to send images, so they can be answered for.
                       <button type="button" class="console-link-btn" data-signin>Sign in</button></p>`;
            case "textarea":
                return `<textarea class="console-input console-input-message console-info-value" maxlength="${DeadEnds.LEAD_ITEM_MAX}"${ph}${name}></textarea>`;
            case "hotel":
                return `<select class="console-input console-select console-info-value"${name}>
                    <option value="">Which hotel?</option>
                    ${DeadEnds.HOTELS.map(h => `<option value="${h}">${h}</option>`).join("")}
                </select>`;
            case "difficulty":
                return `<select class="console-input console-select console-info-value"${name}>
                    <option value="">How hard?</option>
                    ${DeadEnds.DIFFICULTIES.map(d => `<option value="${d.key}">${esc(d.label)}</option>`).join("")}
                </select>`;
            default:
                return `<input type="text" class="console-input console-input-line console-info-value" maxlength="${DeadEnds.LEAD_ITEM_MAX}"${ph}${name}>`;
        }
    }

    function rowHtml(kindKey) {
        const type = currentType();
        return `
            <div class="console-info-item">
                <div class="console-info-item-head">
                    <select class="console-input console-select console-info-kind" aria-label="What are you adding?">${kindOptions(type, kindKey)}</select>
                    <button type="button" class="console-info-remove" aria-label="Remove this">x</button>
                </div>
                <div class="console-info-input">${kindKey ? kindInputHtml(kindKey, type) : ""}</div>
            </div>`;
    }

    function identityNote() {
        const p = signedIn();
        // "Discord name", not "username" (28 Sept 2026): p.name is the
        // display name, which is often not the username at all.
        return `Optional, so we can credit you.${p ? ` We've noted your Discord name (${esc(p.name)}) too.` : ""}`;
    }

    // Only more than one row can lose one: the first is the form.
    function syncRemoveButtons() {
        const rows = infoBody.querySelectorAll(".console-info-item");
        rows.forEach(r => { r.querySelector(".console-info-remove").hidden = rows.length < 2; });
    }

    function renderInfo() {
        // A fresh form is a fresh submission: see clientRef below send().
        clientRef = null;
        const selected = target ? `${target.type}:${target.id}` : "";
        /* A record an admin has marked opens on the likeliest kind of answer
           for the first thing it is missing, so "I can help" on a maze
           missing its builder lands on "Add builder" with the box ready. */
        let firstKind = "";
        if (target && data()) {
            const gaps = data().gapsOf(target.type, target.id);
            if (gaps.length) firstKind = DeadEnds.leadKindForPiece(gaps[0]);
        }
        infoBody.innerHTML = `
            <p class="console-blurb">Know something about a maze or event? Add it here. A person reads every one before anything goes in.</p>

            <label class="console-field-label console-info-label" for="ci-habbo">HABBO ORIGINS USERNAME</label>
            <input type="text" class="console-input console-input-line" id="ci-habbo" maxlength="60" autocomplete="nickname">
            <p class="console-note" id="ci-habbo-note">${identityNote()}</p>

            <label class="console-field-label console-info-label" for="ci-record">MAZE OR EVENT</label>
            <select class="console-input console-select" id="ci-record">${recordOptions(selected)}</select>

            <div id="ci-new" hidden>
                <label class="console-field-label console-info-label" for="ci-new-name">MAZE NAME</label>
                <input type="text" class="console-input console-input-line" id="ci-new-name" maxlength="${DeadEnds.NEW_NAME_MAX}" placeholder="What it's called in the hotel">
            </div>

            <div id="ci-items">${rowHtml(firstKind)}</div>
            <button type="button" class="console-btn console-info-add" id="ci-add">+ Add more</button>

            <input type="text" class="console-hp-field" id="ci-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="console-contact-actions">
                <button type="button" class="console-btn console-btn-cancel" id="ci-back">Back</button>
                <button type="button" class="console-btn console-btn-send" id="ci-send">Send</button>
            </div>
            <p class="console-form-status" id="ci-status" role="status" aria-live="polite" style="display:none;"></p>`;
        syncRemoveButtons();
        syncNewName();
    }

    function syncNewName() {
        const box = document.getElementById("ci-new");
        if (box) box.hidden = currentType() !== "new";
    }

    // The record changed: each row's list of kinds follows it, keeping what
    // was chosen where the new kind of record has it too.
    function refreshKinds() {
        const type = currentType();
        infoBody.querySelectorAll(".console-info-item").forEach(row => {
            const sel = row.querySelector(".console-info-kind");
            const keep = DeadEnds.isLeadKind(type, sel.value) ? sel.value : "";
            const had = sel.value;
            sel.innerHTML = kindOptions(type, keep);
            if (keep !== had) {
                row.querySelector(".console-info-input").innerHTML = keep ? kindInputHtml(keep, type) : "";
                return;
            }
            /* The same kind kept. An image row's label reads differently for
               the new type ("Add photos" for an event), but only its name
               changes. It used to be redrawn outright, which emptied the
               picker and threw away the pictures already chosen. */
            const picker = keep === "images" && row.querySelector(".console-file");
            if (picker) picker.setAttribute("aria-label", DeadEnds.leadKindLabel(keep, type));
        });
        syncNewName();
    }

    infoBody.addEventListener("change", e => {
        if (e.target.id === "ci-record") { refreshKinds(); return; }
        if (e.target.classList.contains("console-info-kind")) {
            const row = e.target.closest(".console-info-item");
            row.querySelector(".console-info-input").innerHTML = e.target.value ? kindInputHtml(e.target.value, currentType()) : "";
            const first = row.querySelector(".console-info-input input, .console-info-input textarea, .console-info-input select");
            if (first) first.focus({ preventScroll: true });
        }
    });

    infoBody.addEventListener("click", e => {
        if (e.target.id === "ci-add") {
            const items = document.getElementById("ci-items");
            if (items.children.length >= DeadEnds.LEAD_ITEMS_MAX) {
                say("That's plenty for one go. Send these, then add more.", true);
                return;
            }
            items.insertAdjacentHTML("beforeend", rowHtml(""));
            syncRemoveButtons();
            items.lastElementChild.querySelector(".console-info-kind").focus({ preventScroll: true });
            return;
        }
        if (e.target.classList.contains("console-info-remove")) {
            e.target.closest(".console-info-item").remove();
            syncRemoveButtons();
            return;
        }
        if (e.target.closest("[data-signin]")) {
            if (window.Account) Account.signIn();
            return;
        }
        if (e.target.id === "ci-back") { Console.showPage("contact"); return; }
        if (e.target.id === "ci-send") send();
    });

    /* Shown first and worded a frame later (1 Oct 2026), as js/console.js's
       liveSay does for the Contact and Event Submission lines: this line is
       a role="status" region hidden until it has something to say, and a
       screen reader often skips a region that appears with its words
       already in it — so "Sending image 1 of 3...", "Sending..." and every
       refusal here went unspoken. The same words again are emptied first so
       the repeat is still a change; a newer say cancels a pending one. */
    let sayFrame = 0;
    function say(text, bad) {
        const el = document.getElementById("ci-status");
        if (!el) return;
        if (sayFrame) cancelAnimationFrame(sayFrame);
        sayFrame = 0;
        el.style.display = text ? "block" : "none";
        const put = () => {
            sayFrame = 0;
            el.textContent = text;
            el.classList.toggle("is-error", Boolean(bad));
        };
        if (!text || document.hidden || typeof requestAnimationFrame !== "function") { put(); return; }
        if (el.textContent === text) el.textContent = "";
        sayFrame = requestAnimationFrame(put);
    }

    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error("Couldn't read that file."));
            r.readAsDataURL(file);
        });
    }

    /* On a leash, like every other request now (see _timedFetch in
       js/api.js): a POST that hung left the button disabled and "Sending..."
       on screen for good. 30s for the lead, past Netlify's 26s ceiling on a
       function so a slow save is not reported as a failure it wasn't; for an
       image, a leash sized to the picture (Api.uploadTimeout), since that
       time is the visitor's upload bandwidth. Retrying after either is safe
       now — see clientRef and uploadedKeys below.

       "Nothing will be sent twice" is only true of the SAME submission: the
       server answers a repeated clientRef with the lead it already has, so a
       form changed after a failed send is a new submission with a new ref
       (see editedSubmission), and the message says as much. */
    const TOO_LONG = "That took too long. Press Send again: unless you change something first, nothing will be sent twice.";

    async function postJson(url, body, ms) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (controller) setTimeout(() => controller.abort(), ms || 30000);
        let res;
        try {
            res = await fetch(url, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });
        } catch (e) {
            if (e && e.name === "AbortError") throw new Error(TOO_LONG);
            throw new Error("That didn't send. Check your connection and try again.");
        }
        /* The leash is still running while the body is read, so it can run
           out HERE — and this used to swallow that into {}, which on an
           upload made the stored key `undefined` and sent the lead on with a
           hole where the picture was. A timeout during the read is the same
           timeout, and a 2xx whose body can't be read is not a success. */
        let out;
        try {
            out = await res.json();
        } catch (e) {
            if (e && e.name === "AbortError") throw new Error(TOO_LONG);
            if (res.ok) throw new Error("That didn't send. Try again in a minute.");
            out = {};
        }
        if (!res.ok) {
            const err = new Error((out && out.error) || "That didn't send. Try again in a minute.");
            // Status and body ride along, so a ban refusal (403 { banned })
            // can be shown as the site's own "Can't Send" (29 Sept 2026).
            err.status = res.status;
            err.data = out;
            throw err;
        }
        return out;
    }

    /* ---- SENDING TWICE, AND UPLOADING TWICE ----

       A failed send used to start again from nothing. Every image was
       uploaded afresh — a visitor on a poor connection with five pictures
       paid for all five again on every retry, and the ones that HAD landed
       were left in storage attached to nothing — and a lead whose POST timed
       out after the server had saved it was saved again on the retry, so the
       review queue got the same submission twice.

       uploadedKeys remembers each picture's storage key against the File it
       came from. A File is the same object for as long as it stays chosen in
       its picker, so a retry skips straight past it; choose a different
       picture and it is a different File, and uploads. A WeakMap, so a form
       thrown away takes its entries with it.

       clientRef names THIS submission: made once, on the first press of
       Send, kept through every retry, and dropped when the form is redrawn
       (renderInfo) — which is also what happens after a success. The server
       keeps the first lead it saw under a ref and answers a repeat with that
       one rather than saving another (netlify/functions/dead-end-leads.js). */
    let uploadedKeys = new WeakMap();
    let clientRef = null;
    // Who the keys above were uploaded as (see the Account.onChange below).
    let senderSeen = window.Account && Account.current ? String(Account.current.id || Account.current.name || "?") : "";

    // Up to 64 of [A-Za-z0-9_-], as the server accepts it.
    function newClientRef() {
        try {
            if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
            if (window.crypto && typeof crypto.getRandomValues === "function") {
                const bytes = crypto.getRandomValues(new Uint8Array(16));
                return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
            }
        } catch (e) { /* fall through */ }
        return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    }

    let sending = false;
    async function send() {
        if (sending) return;
        const record = document.getElementById("ci-record").value;
        if (!record) { say("Choose the maze or event first.", true); return; }
        const type = currentType();
        const newName = type === "new" ? document.getElementById("ci-new-name").value.trim() : "";
        if (type === "new" && !newName) { say("What is the maze called?", true); return; }

        // Every row that has a kind and something in it.
        const rows = [];
        let fileCount = 0;
        for (const row of infoBody.querySelectorAll(".console-info-item")) {
            const kind = row.querySelector(".console-info-kind").value;
            if (!kind) continue;
            const valueEl = row.querySelector(".console-info-value");
            const fileEl = row.querySelector(".console-file");
            // A hidden picker is one kept through a sign-out (see the
            // Account.onChange below): its files can't be sent signed out.
            const files = fileEl && fileEl.style.display !== "none" ? Array.from(fileEl.files || []) : [];
            const value = valueEl ? valueEl.value.trim() : "";
            if (!value && !files.length) continue;
            const tooBig = files.find(f => f.size > DeadEnds.IMAGE_MAX_BYTES);
            if (tooBig) { say(`"${tooBig.name}" is over 4MB.`, true); return; }
            fileCount += files.length;
            rows.push({ kind, value, files });
        }
        if (!rows.length) { say("Choose what you're adding and fill it in.", true); return; }
        if (fileCount > DeadEnds.LEAD_IMAGES_MAX) { say(`Up to ${DeadEnds.LEAD_IMAGES_MAX} images at a time.`, true); return; }

        sending = true;
        editedWhileSending = false;
        const sendBtn = document.getElementById("ci-send");
        sendBtn.disabled = true;
        if (!clientRef) clientRef = newClientRef();
        // The form this send came from. Left behind (Back, another page,
        // the console shut, and a new form begun) before the send lands, the
        // page that is showing by then is not this send's to change.
        const sentRef = clientRef;
        try {
            let done = 0;
            const items = [];
            for (const r of rows) {
                const images = [];
                for (const f of r.files) {
                    ++done;
                    // Already landed on an earlier try: reuse it.
                    const had = uploadedKeys.get(f);
                    if (had) { images.push(had); continue; }
                    say(`Sending image ${done} of ${fileCount}...`);
                    const dataUrl = await readAsDataUrl(f);
                    // Sized to the picture, as js/api.js sizes the admin's
                    // uploads: a flat 90s cut off a 4MB image on a slow
                    // uplink that was getting there.
                    const ms = typeof Api !== "undefined" && Api.uploadTimeout ? Api.uploadTimeout(dataUrl.length) : 90000;
                    const up = await postJson(`${LEADS_URL}?action=upload`, { dataUrl }, ms);
                    if (!up || !up.key) throw new Error("That didn't send. Try again in a minute.");
                    uploadedKeys.set(f, up.key);
                    images.push(up.key);
                }
                items.push({ kind: r.kind, value: r.value, images });
            }
            say("Sending...");
            const [rtype, ...rest] = record.split(":");
            const body = {
                type,
                habboName: document.getElementById("ci-habbo").value.trim(),
                items,
                website: document.getElementById("ci-hp").value,
                clientRef
            };
            if (type === "new") body.name = newName;
            else body.id = rest.join(":");
            await postJson(LEADS_URL, body);
            if (type !== "new" && data()) data().noteLead(rtype, body.id);
            /* Left behind while it was sending (5 Oct 2026, the bug scan):
               it used to wipe the new form being typed in and force the
               Thanks page over whatever was showing. It went through; the
               page that is showing now stays as it is. */
            if (clientRef !== sentRef) return;
            target = null;
            renderInfo();
            /* Credit only promised when there is a name to credit (28 Sept
               2026): a Habbo name typed in, or the sender's nickname — the
               same two names dead-end-leads.js falls back through when a
               lead is credited. Never the Discord name (5 Oct 2026), so a
               signed-in sender with no nickname is not promised it. */
            const named = !!body.habboName || !!(window.Account && Account.current && Account.current.nick);
            Console.showThanks("A person reads every submission. Anything that fills a gap will be added to the archive"
                + (named ? ", with credit to you." : ".") + " Thank you!");
        } catch (err) {
            // Changed while this was on its way: that change is not in what
            // was sent, so the retry is a new submission (editedSubmission).
            if (editedWhileSending) clientRef = null;
            // A blocked sender gets the site's own notice, not the raw words.
            if (window.Account && Account.writeRefused && Account.writeRefused(err.status, err.data, "send")) {
                say("", false);
            } else if (err.status === 401 && signedIn()) {
                /* A session the server has revoked (30 Sept 2026; see
                   writeRefusal in _bans.js), answered with the cookie
                   cleared: the page is told, and the image rows turn into
                   their sign-in prompts. Pictures cannot go without an
                   account, so a form with some says so rather than inviting
                   a Send that would leave them behind. */
                if (typeof Account.refresh === "function") Account.refresh();
                say(fileCount
                    ? "You were signed out. Sign in again to send this with its pictures."
                    : "You were signed out. Press Send again to send it without an account.", true);
            } else {
                say(err.message, true);
            }
        } finally {
            sending = false;
            editedWhileSending = false;
            if (document.body.contains(sendBtn)) sendBtn.disabled = false;
        }
    }

    /* A CHANGED FORM IS A NEW SUBMISSION.

       clientRef is kept through retries so a lead that DID land before its
       answer timed out is not saved twice. But the server answers a repeated
       ref with the lead it already has and throws the new body away — so a
       visitor who, after "That took too long", fixed a typo or added a row
       and pressed Send again was told "Thank you!" for the first version,
       and their edit silently went nowhere. Any change to the form after a
       ref has been made now drops it; the next Send makes a fresh one. A
       change made while a send is still in flight is held until that send
       has answered (see the catch above): if it succeeded the form is
       redrawn anyway, and if it failed the ref goes then. Uploaded pictures
       are unaffected — uploadedKeys is keyed by the File, which an edit
       elsewhere does not change. */
    let editedWhileSending = false;
    function editedSubmission() {
        if (!clientRef) return;
        if (sending) editedWhileSending = true;
        else clientRef = null;
    }
    infoBody.addEventListener("input", editedSubmission);
    infoBody.addEventListener("change", editedSubmission);
    infoBody.addEventListener("click", e => {
        // Adding or removing a row changes the submission as surely as typing.
        if (e.target.id === "ci-add" || e.target.classList.contains("console-info-remove")) editedSubmission();
    });

    /* ------------------------------------------------------------ opening */

    function openInfo(t) {
        target = t && t.type && t.id ? { type: t.type, id: t.id } : null;
        const mp = data();
        renderInfo();
        Console.open("info");
        // The record list is the archive's; if it is still loading, fill the
        // choice in once it lands without losing anything typed meanwhile.
        if (mp && !archiveIn(mp)) {
            archiveWait(mp).then(() => {
                const sel = document.getElementById("ci-record");
                if (!sel) return;
                const was = sel.value || (target ? `${target.type}:${target.id}` : "");
                sel.innerHTML = recordOptions(was);
                refreshKinds();
            });
        }
    }

    function openMissing() {
        // Opening the page is asking: a failed list is tried again.
        renderMissing({ retry: true });
        Console.open("missing");
    }

    Console.openInfo = openInfo;
    Console.openMissing = openMissing;

    /* A sign-in or sign-out while the form is open changes the note under
       the username and what the image rows offer — and only that. The
       image rows used to be rebuilt from scratch on every change, which
       threw away the pictures already chosen (and fired on a session
       re-read that changed nothing at all). Now a row is only touched when
       what it shows no longer matches the account, and a picker is hidden
       on sign-out rather than removed, so signing straight back in finds
       the same files still chosen. */
    function syncImageRow(row) {
        const holder = row.querySelector(".console-info-input");
        const picker = holder.querySelector(".console-file");
        const prompt = holder.querySelector("[data-signin-note]");
        // The "PNG, JPG…" line that sits right after the picker.
        const hint = picker && picker.nextElementSibling && !picker.nextElementSibling.hasAttribute("data-signin-note")
            ? picker.nextElementSibling : null;
        if (signedIn()) {
            if (!picker) { holder.innerHTML = kindInputHtml("images", currentType()); return; }
            // Inline display rather than [hidden]: .console-input sets
            // display:block, which beats the attribute's UA rule.
            picker.style.display = "";
            if (hint) hint.hidden = false;
            if (prompt) prompt.remove();
        } else {
            if (!picker) {
                if (!prompt) holder.innerHTML = kindInputHtml("images", currentType());
                return;
            }
            picker.style.display = "none";
            if (hint) hint.hidden = true;
            // kindInputHtml gives the signed-out prompt alone; only its
            // paragraph is wanted here, beside the kept picker.
            if (!prompt) {
                const tmp = document.createElement("div");
                tmp.innerHTML = kindInputHtml("images", currentType());
                const p = tmp.querySelector("[data-signin-note]");
                if (p) holder.appendChild(p);
            }
        }
    }

    if (window.Account) {
        Account.onChange(() => {
            /* A different sender now (or none). An upload may only be
               claimed by the account that made it, so keys from before
               would be refused, and the submission is not the same one. */
            // Only on a real change: onChange also fires on a re-read that
            // changed nothing, and that must not cost a retry its ref.
            const who = Account.current ? String(Account.current.id || Account.current.name || "?") : "";
            /* Nobody-because-the-network-blinked is not a sender (3 Oct
               2026): a failed `me` reads as null with Account.unsure set,
               and taking that as a change dropped the ref, so the retry
               after "That took too long" saved the lead twice. The real
               answer, when it lands, is compared as usual. */
            const doubtful = !Account.current && Account.unsure === true;
            if (!doubtful && who !== senderSeen) {
                senderSeen = who;
                uploadedKeys = new WeakMap();
                clientRef = null;
            }
            const note = document.getElementById("ci-habbo-note");
            if (note) note.innerHTML = identityNote();
            infoBody.querySelectorAll(".console-info-item").forEach(row => {
                const kind = row.querySelector(".console-info-kind").value;
                if (kind === "images") syncImageRow(row);
            });
        });
    }

    // The list follows the flags if they arrive while it is on screen.
    if (data()) data().onChange(() => {
        if (document.getElementById("console-page-missing").style.display === "block") renderMissing();
    });
});

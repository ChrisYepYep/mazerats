/* ===========================================================
   Maze Rats — the Missing Pieces panel in /warren

   Two halves, both about the same question: which records in the archive
   stop short, and what have people sent in to finish them.

     LEADS    What visitors have sent from a record's "I can help"
              form, newest first. Accept one (optionally copying its
              screenshots into the record's own images, ticking off the
              pieces it answered, and crediting the sender), reject it, or
              delete it outright. The screenshots are quarantined until
              accepted — see netlify/functions/dead-end-leads.js — so they
              are fetched here with the admin token and shown from memory.

     RECORDS  Every marked maze and event, and any other on request. Tick
              the pieces that are really missing and write the line a
              visitor will read. Only what is ticked and saved here is ever
              shown on the site. Stored by netlify/functions/dead-ends.js.

   A file of its own rather than more of js/admin.js, which is already the
   longest thing in the repo. It shares nothing with it but the session
   token, read from the same localStorage key admin.js writes, and the Api
   object's authenticated fetch. It mounts the first time its panel is shown.
   =========================================================== */
(function () {
    "use strict";

    const panel = document.querySelector('.admin-panel[data-panel="deadends"]');
    if (!panel || typeof DeadEnds === "undefined" || typeof Api === "undefined") return;

    const TOKEN_KEY = "mazerats_admin_token";
    const LEADS_URL = "/.netlify/functions/dead-end-leads";
    const FLAGS_URL = "/.netlify/functions/dead-ends";

    const leadsEl = panel.querySelector("#dead-end-leads");
    const recordsEl = panel.querySelector("#dead-end-records");
    const leadTabs = panel.querySelector("#dead-end-lead-tabs");
    const recordSearch = panel.querySelector("#dead-end-record-search");
    const recordFilter = panel.querySelector("#dead-end-record-filter");
    const refreshBtn = panel.querySelector("#dead-end-refresh");
    const navCount = document.getElementById("dead-end-nav-count");

    let mounted = false;
    let leadStatus = "new";
    let leads = [];
    let counts = { new: 0, accepted: 0, rejected: 0 };
    let flags = new Map();          // "type:id" -> flag
    let trail = new Map();          // "type:id" -> waiting lead count
    let records = [];               // [{ type, id, name, raw }]
    let openEditor = null;          // "type:id" of the record being edited
    let editorDraft = null;         // its unsaved ticks and note — see editor()
    let editorBase = null;          // what that editor opened with — see isEditorDirty
    const imageUrls = new Map();    // quarantined key -> promise of an object URL

    function token() {
        try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function call(url, method, body) {
        return Api._write(url, method, token(), body);
    }

    /* A 401 here means the twelve-hour session ran out while the panel was
       open. admin.js owns the sign-in box and knows how to put it back up;
       the cleanest way to hand over is the same reload a fresh visit gets,
       which re-verifies the stored token and asks for the password. Saying
       so first, rather than reloading out from under somebody mid-review. */
    /* That reload lost whatever was half-done here — the ticks and note in
       an open record editor, an accept form part filled in. admin.js now
       lends its lockOut (window.AdminLockOut), so the sign-in box goes up
       over the panel and everything in it is still there afterwards; every
       request reads the token fresh, so the next press simply works. The
       reload stays as the fallback for a page without admin.js. */
    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        if (typeof window.AdminLockOut === "function") {
            window.AdminLockOut();
            return true;
        }
        leadsEl.innerHTML = '<p class="admin-empty">Your session has expired. <button type="button" class="ctl-btn" data-de-reload>Sign in again</button></p>';
        const btn = leadsEl.querySelector("[data-de-reload]");
        if (btn) btn.addEventListener("click", () => location.reload());
        recordsEl.innerHTML = "";
        return true;
    }

    /* The page's own boxes, not the browser's (30 Sept 2026): admin.js
       lends its Are You Sure?, its one-button box and its text-box one as
       window.AdminConfirm / AdminAlert / AdminPrompt. All three take markup,
       so anything a visitor wrote is escaped before it goes in. Without
       admin.js (a page that failed to load it) a question answers No and a
       problem is said in the flash line, rather than falling back to the
       browser's own pop-ups. */
    function ask(html, opts) {
        return typeof window.AdminConfirm === "function" ? window.AdminConfirm(html, opts) : Promise.resolve(false);
    }
    function askText(html, opts) {
        return typeof window.AdminPrompt === "function" ? window.AdminPrompt(html, opts) : Promise.resolve(null);
    }
    function tell(text) {
        if (typeof window.AdminAlert === "function") return window.AdminAlert(escapeHtml(text));
        flash(text);
        return Promise.resolve();
    }

    function keyOf(type, id) { return `${type}:${id}`; }

    function when(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    function pieceLabel(key) {
        const p = DeadEnds.piece(key);
        return p ? p.label : key;
    }

    // ------------------------------------------------------------- loading

    function listOf(data) {
        if (Array.isArray(data)) return data;
        return (data && (data.rooms || data.items)) || [];
    }

    /* Counted, so a load that was still on its way when the account changed
       (see reset) is dropped rather than drawing the last account's leads
       over the next one's panel. */
    let loadGen = 0;

    async function loadAll() {
        const gen = ++loadGen;
        leadsEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        recordsEl.innerHTML = "";
        try {
            const [leadData, flagData, rooms, events] = await Promise.all([
                call(`${LEADS_URL}?status=${encodeURIComponent(leadStatus)}`, "GET"),
                call(`${FLAGS_URL}?full=1`, "GET"),
                Api.getRoomsFull(token()),
                Api.getEventsFull(token())
            ]);
            if (gen !== loadGen) return;
            leads = leadData.leads || [];
            counts = leadData.counts || counts;
            flags = new Map((flagData.flags || []).map(f => [keyOf(f.type, f.id), f]));
            trail = new Map((flagData.trail || []).map(t => [keyOf(t.type, t.id), t.leads]));
            records = [
                ...listOf(rooms).map(r => ({ type: "maze", id: r.id, name: r.name || r.id, raw: r })),
                ...listOf(events).map(e => ({ type: "event", id: e.id, name: e.title || e.id, raw: e }))
            ].sort((a, b) => a.name.localeCompare(b.name));
            renderLeadTabs();
            renderLeads();
            renderRecords();
        } catch (err) {
            if (gen !== loadGen) return;
            if (sessionGone(err)) {
                // Not left saying "Loading…" behind the sign-in box.
                if (typeof window.AdminLockOut === "function") {
                    leadsEl.innerHTML = '<p class="admin-empty">Your session expired before this loaded. Sign in again, then press Refresh.</p>';
                }
                return;
            }
            leadsEl.innerHTML = `<p class="admin-empty">Could not load the missing pieces: ${escapeHtml(err.message)}</p>`;
        }
    }

    async function reloadLeads() {
        try {
            const data = await call(`${LEADS_URL}?status=${encodeURIComponent(leadStatus)}`, "GET");
            leads = data.leads || [];
            counts = data.counts || counts;
            renderLeadTabs();
            renderLeads();
        } catch (err) {
            if (!sessionGone(err)) tell(`Could not load the leads: ${err.message}`);
        }
    }

    async function reloadFlags() {
        const data = await call(`${FLAGS_URL}?full=1`, "GET");
        flags = new Map((data.flags || []).map(f => [keyOf(f.type, f.id), f]));
        trail = new Map((data.trail || []).map(t => [keyOf(t.type, t.id), t.leads]));
        renderRecords();
    }

    // --------------------------------------------------------------- leads

    function renderLeadTabs() {
        const labels = { new: "New", accepted: "Accepted", rejected: "Rejected", all: "All" };
        leadTabs.innerHTML = Object.keys(labels).map(k => {
            const n = k === "all" ? (counts.new + counts.accepted + counts.rejected) : counts[k];
            return `<button type="button" class="btn-enter-mini${k === leadStatus ? " active" : ""}" data-status="${k}">${labels[k]}${n ? ` (${n})` : ""}</button>`;
        }).join("");
        if (navCount) {
            navCount.textContent = counts.new ? String(counts.new) : "";
            navCount.hidden = !counts.new;
        }
    }

    leadTabs.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-status]");
        if (!btn || btn.dataset.status === leadStatus) return;
        leadStatus = btn.dataset.status;
        reloadLeads();
    });

    /* The quarantined screenshots can only be read with the admin token, and
       an <img> cannot send a header — so each is fetched here and shown from
       an object URL. Kept for the life of the page; there are never many.

       The PROMISE is cached, not the finished URL. Caching the URL only
       once it arrived meant two renders close together (a reload of the
       leads straight after an accept, say) both missed the cache, both
       fetched, and each made an object URL — one of which was then leaked
       for the life of the page. A failure is dropped from the cache so a
       later render can try again, and carries its status so a 401 can be
       sent to sessionGone like every other request here. */
    function imageUrl(key) {
        if (!imageUrls.has(key)) {
            const pending = fetch(`/.netlify/functions/image?key=${encodeURIComponent(key)}`, {
                headers: { "x-admin-token": token() }
            }).then(async res => {
                if (!res.ok) {
                    const err = new Error(String(res.status));
                    err.status = res.status;
                    throw err;
                }
                return URL.createObjectURL(await res.blob());
            });
            pending.catch(() => { if (imageUrls.get(key) === pending) imageUrls.delete(key); });
            imageUrls.set(key, pending);
        }
        return imageUrls.get(key);
    }

    function recordFor(lead) {
        return records.find(r => r.type === lead.type && r.id === lead.recordId) || null;
    }

    function renderLeads() {
        leadsEl.innerHTML = "";
        if (!leads.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = leadStatus === "new"
                ? "No new leads. Nobody has found a way through yet."
                : "Nothing here.";
            leadsEl.appendChild(empty);
            return;
        }
        leads.forEach(lead => leadsEl.appendChild(leadRow(lead)));
    }

    /* Built from DOM nodes, not markup: every word in a lead came from an
       anonymous visitor, exactly like the contact messages. */
    function leadRow(lead) {
        const row = document.createElement("div");
        row.className = "chrome-list-row admin-row de-lead";
        row.dataset.status = lead.status;

        const info = document.createElement("div");
        info.className = "row-info";

        const h = document.createElement("h3");
        const rec = recordFor(lead);
        h.appendChild(document.createTextNode(rec ? rec.name : lead.recordName || lead.recordId));
        const meta = document.createElement("span");
        meta.className = "admin-contributor-count";
        const kindWord = lead.type === "new" ? "Not in the archive yet" : lead.type === "event" ? "Event" : "Maze";
        meta.textContent = ` - ${kindWord} · ${when(lead.createdAt)}`;
        h.appendChild(meta);
        info.appendChild(h);

        const chips = document.createElement("div");
        chips.className = "de-chips";
        const status = document.createElement("span");
        status.className = `de-chip de-status-${lead.status}`;
        status.textContent = lead.status === "new" ? "New" : lead.status === "accepted" ? "Accepted" : "Rejected";
        chips.appendChild(status);
        if (lead.type === "new") {
            const chip = document.createElement("span");
            chip.className = "de-chip is-noticed";
            chip.textContent = "New maze";
            chips.appendChild(chip);
        }
        info.appendChild(chips);

        /* What they sent: one line per item, the action they chose as its
           label ("Add builder") and what they put in it, with that item's
           own images under it. Older leads from the first version of the
           form carry a single piece and text instead, and are shown as one
           "Something else" item. */
        const items = Array.isArray(lead.items) ? lead.items
            : [{ kind: "other", value: lead.text || "", images: lead.images || [] }];
        items.forEach(item => {
            const box = document.createElement("div");
            box.className = "de-lead-item";
            const label = document.createElement("span");
            label.className = "ctl-label";
            label.textContent = DeadEnds.leadKindLabel(item.kind, lead.type === "new" ? "new" : lead.type);
            box.appendChild(label);
            if (item.value) {
                const p = document.createElement("p");
                p.className = "row-creator de-lead-text";
                // Hotel and difficulty are keys; say them as the archive does.
                const d = item.kind === "difficulty" && DeadEnds.DIFFICULTIES.find(x => x.key === item.value);
                p.textContent = d ? d.label : item.value;
                box.appendChild(p);
            }
            /* A rejected lead's screenshots were deleted when it was
               rejected, so there is nothing to fetch — every tile only ever
               came back "gone". Said once in words instead. (Leads rejected
               before the server began emptying these lists still carry the
               keys.) */
            if (item.images && item.images.length) {
                if (lead.status === "rejected") {
                    const gone = document.createElement("p");
                    gone.className = "de-lead-who";
                    gone.textContent = `${item.images.length === 1 ? "Its image was" : `Its ${item.images.length} images were`} deleted when the lead was rejected.`;
                    box.appendChild(gone);
                } else {
                    box.appendChild(shotStrip(item.images));
                }
            }
            info.appendChild(box);
        });

        const who = document.createElement("p");
        who.className = "de-lead-who";
        const bits = [];
        if (lead.habboName) bits.push(`Habbo: ${lead.habboName}`);
        /* The display name can be anything and is shared by any number of
           people; from.username is the unique Discord handle, so it is shown
           beside it when the server sends it. A view-only account is not
           sent the account id or the address (dead-end-leads.js), and
           nothing here needs either: Ban IP only appears when lead.ip does. */
        if (lead.from) {
            const handle = lead.from.username ? ` @${lead.from.username}` : "";
            bits.push(`Discord: ${lead.from.name || lead.from.username || "an account"}${handle && lead.from.name ? handle : ""} (signed in)`);
        }
        if (!bits.length) bits.push("Anonymous");
        who.textContent = bits.join(" · ");
        info.appendChild(who);

        if (lead.promoted && lead.promoted.length) info.appendChild(promotedList(lead.promoted));

        if (lead.reviewedBy) {
            const rv = document.createElement("p");
            rv.className = "de-lead-who";
            rv.textContent = `${lead.status === "accepted" ? "Accepted" : lead.status === "rejected" ? "Rejected" : "Reopened"} by ${lead.reviewedBy}${lead.reviewNote ? `: ${lead.reviewNote}` : ""}`;
            info.appendChild(rv);
        }

        /* Every one of these writes, so each carries de-write: the class
           css/style.css greys for a view-only (or Albus) account, which the
           server refuses anyway. Copy and "Sign in again" do not carry it. */
        const actions = document.createElement("div");
        actions.className = "admin-row-actions";
        if (lead.status !== "accepted") actions.appendChild(button("Accept…", () => toggleAccept(row, lead), "", "de-write"));
        if (lead.status === "new") actions.appendChild(button("Reject", () => reject(lead), "", "de-write"));
        if (lead.status !== "new") actions.appendChild(button("Reopen", () => review(lead, { status: "new" }), "", "de-write"));
        if (lead.ip) {
            const banBtn = button("Ban IP", () => (isBanned(lead.ip) ? unban(lead.ip) : ban(lead.ip)), lead.ip, "admin-delete-btn de-write de-ban-btn");
            banBtn.dataset.ip = lead.ip;
            paintBanButton(banBtn);
            actions.appendChild(banBtn);
        }
        actions.appendChild(button("Delete", () => remove(lead), "", "admin-delete-btn de-write"));

        row.appendChild(info);
        row.appendChild(actions);
        return row;
    }

    // A row of a lead's quarantined images, each fetched with the admin token.
    function shotStrip(images) {
        const strip = document.createElement("div");
        strip.className = "de-shots";
        images.forEach((img, i) => {
            const a = document.createElement("a");
            a.className = "de-shot";
            a.target = "_blank";
            a.rel = "noopener";
            a.title = `Image ${i + 1}`;
            const im = document.createElement("img");
            im.alt = `Image ${i + 1}`;
            im.loading = "lazy";
            a.appendChild(im);
            strip.appendChild(a);
            imageUrl(img.key)
                .then(url => { im.src = url; a.href = url; })
                .catch(err => {
                    // An expired session is not a missing picture.
                    if (sessionGone(err)) return;
                    a.classList.add("is-missing");
                    a.textContent = "gone";
                });
        });
        return strip;
    }

    function button(label, onClick, title, extra) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `ctl-btn${extra ? " " + extra : ""}`;
        b.textContent = label;
        if (title) b.title = title;
        b.addEventListener("click", onClick);
        return b;
    }

    function promotedList(urls) {
        const box = document.createElement("div");
        box.className = "de-promoted";
        const say = document.createElement("p");
        say.className = "de-lead-who";
        /* Where exactly to paste. This used to say "the record's form",
           but the gallery, entrance, finish and related images only took
           uploads — there was nowhere in that form a pasted address could
           go. The gallery and Related images now each have an "Add from
           URL" box for precisely these (see archiveImageFromUrl in
           js/admin.js). */
        say.textContent = "Copied into the archive's images. To use one, copy it, open the record under Mazes or Events, and paste it into \"Add from URL\" under the room-by-room gallery (or Related images).";
        box.appendChild(say);
        urls.forEach(u => {
            const line = document.createElement("div");
            line.className = "ctl-row";
            const input = document.createElement("input");
            input.className = "ctl-input";
            input.readOnly = true;
            input.value = u;
            line.appendChild(input);
            line.appendChild(button("Copy", () => {
                input.select();
                if (navigator.clipboard) navigator.clipboard.writeText(u).catch(() => document.execCommand("copy"));
                else document.execCommand("copy");
            }));
            box.appendChild(line);
        });
        return box;
    }

    /* Accepting is a small form of its own, opened under the lead: what to do
       with the screenshots, which pieces this answers, and who to thank. The
       defaults are the likely answer — copy the pictures, tick off the piece
       they said they were answering, credit the name they gave. */
    function toggleAccept(row, lead) {
        const existing = row.querySelector(".de-accept");
        if (existing) { existing.remove(); return; }

        const flag = lead.type === "new" ? null : flags.get(keyOf(lead.type, lead.recordId));
        const marked = flag ? flag.pieces : [];
        const form = document.createElement("div");
        form.className = "de-accept";

        /* Which marked pieces to tick off: the ones the kinds of thing they
           sent could fill (an "Add builder" answers a missing builder). A
           guess for the admin to correct, like the editor's suggestions. */
        const answered = new Set();
        (lead.items || []).forEach(it => {
            const k = DeadEnds.leadKind(it.kind);
            if (k) k.pieces.forEach(p => answered.add(p));
        });

        const hasShots = lead.images && lead.images.length;
        // A player's chosen nickname before their Discord name (28 Sept
        // 2026): the credit is public, and the nickname is the name they
        // asked the site to show. dead-end-leads.js keeps `from.nick` current.
        const creditName = lead.habboName || (lead.from && (lead.from.nick || lead.from.name)) || "";
        /* What an earlier accept already did. A lead accepted, reopened and
           accepted again opened this form with both boxes ticked, inviting a
           second copy of the screenshots and a second credit. The server now
           refuses to repeat either, but the form should not be asking for
           them: already done is shown as done, and left unticked. */
        const alreadyCopied = Array.isArray(lead.promoted) && lead.promoted.length > 0;
        const alreadyCredited = lead.credited ? String(lead.credited) : "";
        form.innerHTML = `
            ${hasShots ? `<label class="de-check"><input type="checkbox" data-f="promote"${alreadyCopied ? "" : " checked"}> Copy the ${lead.images.length === 1 ? "image" : `${lead.images.length} images`} into the archive's images${alreadyCopied ? " — already copied, listed above" : ""}</label>` : ""}
            ${marked.length ? `<div class="de-resolve"><span class="ctl-label">This answers</span>${marked.map(k => `<label class="de-check"><input type="checkbox" data-resolve="${escapeHtml(k)}"${answered.has(k) ? " checked" : ""}> ${escapeHtml(pieceLabel(k))}</label>`).join("")}</div>` : ""}
            <label class="de-check"><input type="checkbox" data-f="credit"${creditName && !alreadyCredited ? " checked" : ""}> Credit as a contributor${alreadyCredited ? ` — already credited as ${escapeHtml(alreadyCredited)}` : ""}</label>
            <input type="text" class="ctl-input" data-f="creditName" maxlength="60" placeholder="Name to credit" value="${escapeHtml(creditName)}">
            <input type="text" class="ctl-input" data-f="note" maxlength="500" placeholder="Note (optional, admins only)">
            <div class="ctl-actions"><button type="button" class="ctl-btn de-write" data-f="go">Accept</button></div>`;
        const go = form.querySelector('[data-f="go"]');
        go.addEventListener("click", async () => {
            const pick = (f) => form.querySelector(`[data-f="${f}"]`);
            const body = {
                status: "accepted",
                promote: Boolean(pick("promote") && pick("promote").checked),
                credit: pick("credit").checked,
                creditName: pick("creditName").value.trim(),
                note: pick("note").value.trim(),
                resolve: Array.from(form.querySelectorAll("[data-resolve]")).filter(i => i.checked).map(i => i.dataset.resolve)
            };
            /* Off the moment it is pressed, boxes and all. A second click
               while the first was still copying screenshots used to send a
               second accept — two sets of copies, two credits — and a box
               ticked mid-request changed nothing anyone could see. Back on
               only if it failed, so it can be tried again. */
            const controls = Array.from(form.querySelectorAll("input, button"));
            controls.forEach(el => { el.disabled = true; });
            go.textContent = "Accepting…";
            const ok = await review(lead, body);
            if (!ok && form.isConnected) {
                controls.forEach(el => { el.disabled = false; });
                go.textContent = "Accept";
            }
        });
        row.querySelector(".row-info").appendChild(form);
    }

    // Resolves true when the review was saved, false when it was not — the
    // accept form uses it to decide whether to switch itself back on.
    /* Re-reading the lists after a write that has ALREADY succeeded. Kept
       apart from the write's own try: it used to share one, so when the
       re-read failed after a perfectly good accept, the admin was told
       "Could not save that" — and, believing it, accepted the lead again.
       A failure here says what actually happened instead: saved, and the
       list is behind. (reloadLeads says its own failures; reloadFlags
       throws them to here.) */
    async function refreshAfterWrite() {
        try {
            await Promise.all([reloadLeads(), reloadFlags()]);
        } catch (err) {
            if (!sessionGone(err)) flash(`Saved. The list could not be refreshed (${err.message}) — press Refresh to see it.`);
        }
    }

    async function review(lead, body) {
        let out;
        try {
            out = await call(LEADS_URL, "PATCH", { id: lead.id, ...body });
        } catch (err) {
            if (!sessionGone(err)) await tell(`Could not save that: ${err.message}`);
            return false;
        }
        // Saved. Nothing from here on can make it not have been.
        if (out && out.promoted && out.promoted.length) lead.promoted = out.promoted;
        await refreshAfterWrite();
        if (out && out.credited) {
            flash(`Credited ${out.credited} in Contributors.`);
            /* Tells js/admin.js to re-read its contributor list. Its copy
               was loaded at sign-in, and editing the person just credited
               from that copy saved the old record back over the credit. */
            document.dispatchEvent(new CustomEvent("mazerats:contributors-changed"));
        }
        if (out && out.promoted && out.promoted.length && leadStatus === "new") {
            flash("Accepted. The copied screenshots are listed under Accepted.");
        }
        /* The accept is saved, but another request (a second press, or a
           second admin) is already copying this lead's screenshots, so this
           one did not start a second copy — see the claim in
           dead-end-leads.js. Not an error, and nothing to press again: the
           copies land on their own. Said last so no other line covers it. */
        if (out && out.promoteBusy) {
            flash("Accepted. Its screenshots are still being copied — press Refresh in a moment to see them.");
        }
        /* The maze or event this lead is about has been deleted since (30
           Sept 2026; recordGone in dead-end-leads.js): no screenshots were
           copied, and a credit went on as an "other" contribution. Said in
           a box rather than the flash line, because it is not what the
           admin asked for. */
        if (out && out.recordGone) {
            const kind = lead.type === "event" ? "event" : "maze";
            const bits = [`Accepted, but this lead's ${kind} is no longer in the archive.`];
            if (out.promoteSkipped) bits.push("Its screenshots were not copied — there is nowhere to show them.");
            if (out.credited) bits.push(`${out.credited} is credited with one "other" contribution instead of the ${kind}.`);
            await tell(bits.join(" "));
        }
        return true;
    }

    async function reject(lead) {
        const hasShots = lead.images && lead.images.length;
        // Red when it deletes the screenshots: that part cannot be undone.
        const note = await askText(`Reject this lead?${hasShots ? " Its screenshots will be deleted." : ""}`,
            { label: "Note (optional, admins only)", maxlength: 500, danger: !!hasShots });
        if (note === null) return;
        review(lead, { status: "rejected", note: note.trim() });
    }

    async function remove(lead) {
        if (!await ask("Delete this lead and any screenshots with it? This cannot be undone.", { danger: true })) return;
        let out;
        try {
            out = await call(`${LEADS_URL}?id=${encodeURIComponent(lead.id)}`, "DELETE");
        } catch (err) {
            if (!sessionGone(err)) await tell(`Could not delete it: ${err.message}`);
            return;
        }
        /* The copies an accept made (30 Sept 2026), which nothing used to
           delete. Background clean-up, as the maze form's is: upload.js
           keeps any copy a record still shows (a 409) and any it could not
           check (a 503), and either failure simply leaves the file. */
        const copies = (out && Array.isArray(out.promotedKeys)) ? out.promotedKeys : [];
        if (copies.length && typeof Api.deleteImage === "function") {
            copies.forEach(k => Api.deleteImage(token(), k).catch(() => { /* kept: see above */ }));
        }
        // Deleted; a failed re-read is said as that, not as a failed delete.
        await refreshAfterWrite();
    }

    /* Ban IP (30 Sept 2026). This was a prompt() that said it banned the
       address "from the contact form and from sending leads" and posted
       the old { ip, reason } — which bans.js has made, since 29 Sept, a
       PERMANENT everything-but-reading ban on the address's whole network:
       no signing in, no games, no boards. What the admin was told and what
       happened had come apart. It borrows the contact messages' Ban IP from
       admin.js now (window.AdminBanIp), so the admin picks the level and
       the length in the same box, reads what each means, and it posts the
       new { kind, value, level, ... } shape. */
    async function ban(ip) {
        if (typeof window.AdminBanIp !== "function") {
            flash("This copy of the page is out of date. Reload it to ban.");
            return;
        }
        const done = await window.AdminBanIp(ip, { reason: "Missing Pieces spam" });
        if (done) flash(`Banned ${ip}. It is listed under Bans.`);
    }

    /* Ban IP or Unban IP, as the contact messages' button is (30 Sept
       2026). It always said Ban IP, so an address banned already offered
       to be banned again, and a 409 said so after the whole dialog. The
       check is admin.js's own (window.AdminIsBanned — an active ban on the
       address or its /64), asked again on every click rather than kept, and
       the labels are repainted in place whenever the ban list is re-read,
       so an open accept form in the row is left alone. */
    function isBanned(ip) {
        return typeof window.AdminIsBanned === "function" && !!window.AdminIsBanned(ip);
    }
    function paintBanButton(b) {
        const banned = isBanned(b.dataset.ip);
        b.textContent = banned ? "Unban IP" : "Ban IP";
        b.title = banned ? `${b.dataset.ip} is banned` : b.dataset.ip;
    }
    document.addEventListener("mazerats:bans-changed", () => {
        leadsEl.querySelectorAll(".de-ban-btn").forEach(paintBanButton);
    });

    async function unban(ip) {
        if (typeof window.AdminUnbanIp !== "function") {
            flash("This copy of the page is out of date. Reload it to unban.");
            return;
        }
        if (await window.AdminUnbanIp(ip)) flash(`Unbanned ${ip}.`);
    }

    let flashTimer = null;
    function flash(message) {
        let el = panel.querySelector(".de-flash");
        if (!el) {
            el = document.createElement("p");
            el.className = "ctl-status de-flash";
            el.setAttribute("role", "status");
            leadsEl.parentNode.insertBefore(el, leadsEl);
        }
        el.textContent = message;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { el.textContent = ""; }, 6000);
    }

    // ------------------------------------------------------------- records

    /* The records list. What a VISITOR sees is only ever what is marked here;
       the page's own guesses (DeadEnds.suggested) exist for one job, which is
       pre-ticking the editor for a record nobody has marked yet, and they are
       shown in this list only under "Might be missing something" so there is
       a way to find candidates without opening every maze. */
    function renderRecords() {
        const q = (recordSearch.value || "").trim().toLowerCase();
        const mode = recordFilter.value;
        const shown = records.filter(rec => {
            if (q) return rec.name.toLowerCase().includes(q);
            const flag = flags.get(keyOf(rec.type, rec.id));
            if (mode === "marked") return Boolean(flag);
            if (mode === "suggested") return !flag && DeadEnds.suggested(rec.raw, rec.type).length > 0;
            return true;
        });

        recordsEl.innerHTML = "";
        if (!shown.length) {
            recordsEl.innerHTML = `<p class="admin-empty">${q ? "No record by that name." : mode === "marked" ? "Nothing is marked as missing anything yet. Find a maze above, or look under \"Suggestions\"." : "Nothing to suggest."}</p>`;
            return;
        }
        shown.forEach(rec => recordsEl.appendChild(recordRow(rec)));
    }

    recordSearch.addEventListener("input", renderRecords);
    recordFilter.addEventListener("change", renderRecords);

    function recordRow(rec) {
        const k = keyOf(rec.type, rec.id);
        const flag = flags.get(k) || null;
        const waiting = trail.get(k) || 0;

        /* Marked records show what is marked, solid. An unmarked one shows
           the page's suggestions outlined and labelled as such — until
           somebody saves it they are only a guess, and the public site does
           not know about them. */
        let chips;
        if (flag) {
            chips = DeadEnds.gapsOf(rec.type, flag)
                .map(key => `<span class="de-chip is-marked">${escapeHtml(pieceLabel(key))}</span>`).join("");
        } else {
            const guess = DeadEnds.suggested(rec.raw, rec.type);
            chips = guess.length
                ? `<span class="de-hint">Suggested:</span>` + guess.map(key => `<span class="de-chip is-noticed">${escapeHtml(pieceLabel(key))}</span>`).join("")
                : '<span class="de-chip de-status-accepted">Not marked</span>';
        }

        const row = document.createElement("div");
        row.className = "chrome-list-row admin-row de-record";

        const info = document.createElement("div");
        info.className = "row-info";
        info.innerHTML = `
            <h3>${escapeHtml(rec.name)} <span class="admin-contributor-count"> - ${rec.type === "event" ? "Event" : "Maze"}${waiting ? ` · ${waiting} waiting lead${waiting === 1 ? "" : "s"}` : ""}</span></h3>
            <div class="de-chips">${chips}</div>
            ${flag && flag.note ? `<p class="row-creator">${escapeHtml(flag.note)}</p>` : ""}`;

        const actions = document.createElement("div");
        actions.className = "admin-row-actions";
        // Both lead only to a write (the editor's Save, or the clear), so
        // both are greyed for a view-only account — see de-write above.
        actions.appendChild(button(flag ? "Edit" : "Mark…", async () => {
            // Asked first if this closes an editor with unsaved ticks.
            if (!(await mayDropEditor())) return;
            openEditor = openEditor === k ? null : k;
            editorDraft = editorBase = null;
            renderRecords();
        }, "", "de-write"));
        if (flag) actions.appendChild(button("Clear", () => clearFlag(rec), "", "admin-delete-btn de-write"));

        row.appendChild(info);
        row.appendChild(actions);
        if (openEditor === k) info.appendChild(editor(rec, flag));
        return row;
    }

    /* One box per piece this kind of record can be missing, grouped the way
       the table in js/dead-ends.js is. Ticked means asked for in public.

       A record that has never been marked opens with the page's suggestions
       already ticked — the entrance shot a maze has no picture for, the
       builder nobody wrote down — so the usual job is unticking what is not
       really missing (an entrance that is simply room 1) rather than working
       through twenty boxes. A record that HAS been marked opens exactly as
       it was saved, and the suggestions stay out of it. */
    function editor(rec, flag) {
        /* The list is rebuilt from scratch on every renderRecords — each
           keystroke in the search box, Refresh, and the reload after any
           accept, reject or delete — and the editor with it. Built from the
           flag each time, it threw away whatever had been ticked and typed
           so far. What the admin has done to it is kept in editorDraft
           instead (for this record only; opening another, Cancel and Save
           all drop it) and wins over the stored flag when it is rebuilt. */
        const k = keyOf(rec.type, rec.id);
        const draft = editorDraft && editorDraft.key === k ? editorDraft : null;
        const ticked = new Set(draft ? draft.pieces : flag ? flag.pieces : DeadEnds.suggested(rec.raw, rec.type));
        const noteText = draft ? draft.note : flag ? flag.note : "";
        // What it opened with, for isEditorDirty. Kept across rebuilds.
        if (!editorBase || editorBase.key !== k) editorBase = { key: k, pieces: [...ticked].sort(), note: noteText || "" };
        const form = document.createElement("div");
        form.className = "de-editor";
        form.innerHTML = `
            ${flag ? "" : `<p class="de-hint">Pre-ticked from what the record looks like it is missing. Untick anything that isn't really missing.</p>`}
            <span class="ctl-label">Missing</span>
            <div class="de-pieces">${DeadEnds.piecesFor(rec.type).map(p => `
                <label class="de-check" title="${escapeHtml(p.ask)}"><input type="checkbox" data-mark="${p.key}"${ticked.has(p.key) ? " checked" : ""}> ${escapeHtml(p.label)}</label>`).join("")}
            </div>
            <span class="ctl-label">What exactly (shown to visitors)</span>
            <textarea class="ctl-input de-note" maxlength="${DeadEnds.NOTE_MAX}" rows="2" placeholder="e.g. The secret room behind the bookcase in room 12">${escapeHtml(noteText)}</textarea>
            <div class="ctl-actions">
                <button type="button" class="ctl-btn de-write" data-f="save">Save</button>
                <button type="button" class="ctl-btn" data-f="cancel">Cancel</button>
            </div>
            <p class="ctl-status" data-f="status"></p>`;

        const remember = () => {
            editorDraft = {
                key: k,
                pieces: Array.from(form.querySelectorAll("[data-mark]")).filter(i => i.checked).map(i => i.dataset.mark),
                note: form.querySelector(".de-note").value
            };
        };
        form.addEventListener("change", remember);
        form.addEventListener("input", remember);

        form.querySelector('[data-f="cancel"]').addEventListener("click", async () => {
            if (!(await mayDropEditor())) return;
            openEditor = null;
            editorDraft = editorBase = null;
            renderRecords();
        });
        form.querySelector('[data-f="save"]').addEventListener("click", async () => {
            const status = form.querySelector('[data-f="status"]');
            const body = {
                type: rec.type,
                id: rec.id,
                pieces: Array.from(form.querySelectorAll("[data-mark]")).filter(i => i.checked).map(i => i.dataset.mark),
                note: form.querySelector(".de-note").value.trim()
            };
            // Nothing ticked is "not a dead end": the server deletes the flag.
            if (!body.pieces.length && !flag) {
                status.textContent = "Tick at least one thing that is missing.";
                status.classList.add("is-bad");
                return;
            }
            status.textContent = "Saving…";
            status.classList.remove("is-bad");
            try {
                await call(FLAGS_URL, "PUT", body);
            } catch (err) {
                /* The sign-in box is up over the editor, which is kept (see
                   sessionGone) — but its status line used to stay on
                   "Saving…" underneath, so after signing back in it read as
                   a save still in flight rather than one that never
                   happened, and nothing said to press Save again. */
                if (sessionGone(err)) {
                    status.textContent = "Not saved: your session had expired. Sign in, then press Save again.";
                    status.classList.add("is-bad");
                    return;
                }
                status.textContent = err.message;
                status.classList.add("is-bad");
                return;
            }
            // Saved. The re-read is separate, so its failure cannot be
            // reported as this save failing — see refreshAfterWrite.
            openEditor = null;
            editorDraft = editorBase = null;
            try {
                await reloadFlags();
            } catch (err) {
                if (!sessionGone(err)) {
                    status.textContent = `Saved. The list could not be refreshed (${err.message}) — press Refresh to see it.`;
                    status.classList.remove("is-bad");
                }
            }
        });
        return form;
    }

    /* Unsaved ticks or note in the open editor (30 Sept 2026). They were
       dropped without a word by Edit on another record, Cancel, and closing
       the tab. Compared with what the editor opened with (editorBase), so
       ticking a box and unticking it again is not a change. */
    function isEditorDirty() {
        if (!openEditor || !editorDraft || !editorBase || editorDraft.key !== openEditor || editorBase.key !== openEditor) return false;
        const now = editorDraft.pieces.slice().sort();
        return now.join(",") !== editorBase.pieces.join(",") || (editorDraft.note || "") !== editorBase.note;
    }
    async function mayDropEditor() {
        if (!isEditorDirty()) return true;
        return ask("Discard your unsaved changes to this record's missing pieces? What you have ticked and written since opening it will be lost.");
    }
    window.addEventListener("beforeunload", e => {
        if (!isEditorDirty()) return;
        e.preventDefault();
        e.returnValue = "";
    });

    async function clearFlag(rec) {
        if (!await ask(`Take "${escapeHtml(rec.name)}" off the Missing Pieces list? It will show as complete everywhere on the site.`, { danger: true })) return;
        try {
            await call(`${FLAGS_URL}?type=${rec.type}&id=${encodeURIComponent(rec.id)}`, "DELETE");
        } catch (err) {
            if (!sessionGone(err)) await tell(`Could not clear it: ${err.message}`);
            return;
        }
        await refreshAfterWrite();
    }

    refreshBtn.addEventListener("click", loadAll);

    // ---------------------------------------------------------------- mount

    /* Loaded the first time the panel is actually shown, like the run log:
       most visits to /warren never open it, and it reads the whole archive. */
    function maybeMount() {
        if (mounted || panel.hidden || !token()) return;
        mounted = true;
        loadAll();
    }
    new MutationObserver(maybeMount).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    maybeMount();

    /* Forget everything the last account loaded. admin.js calls this on a
       log out, and when a DIFFERENT account signs in after the session ran
       out (window.AdminDeadEnds.reset — see resetAccountPanels there).

       Mounting was once per page, so the leads — senders' IP addresses and
       all, which only owners and admins are sent — stayed on screen for
       whoever signed in next on the same tab, view-only accounts included,
       with an editor and its unsaved ticks still open from the last person.
       The quarantined screenshots were fetched with the last token too, and
       go with it. Loads again straight away if the panel is the one showing
       and somebody is signed in; otherwise the next time it is shown. */
    function reset() {
        // A load still running for the last account lands on nothing.
        loadGen++;
        mounted = false;
        leadStatus = "new";
        leads = [];
        counts = { new: 0, accepted: 0, rejected: 0 };
        flags = new Map();
        trail = new Map();
        records = [];
        openEditor = null;
        editorDraft = editorBase = null;
        const urls = Array.from(imageUrls.values());
        imageUrls.clear();
        urls.forEach(p => p.then(u => URL.revokeObjectURL(u)).catch(() => {}));
        leadsEl.innerHTML = "";
        recordsEl.innerHTML = "";
        leadTabs.innerHTML = "";
        if (navCount) { navCount.textContent = ""; navCount.hidden = true; }
        if (!token()) return;
        maybeMount();
        badge();
    }
    // isDirty for admin.js's log out, which asks before it drops the editor,
    // and dropEditor for once it has been told Yes.
    const dropEditor = () => { openEditor = null; editorDraft = editorBase = null; };
    window.AdminDeadEnds = { reset, isDirty: isEditorDirty, dropEditor };

    /* The nav badge wants the number of new leads before anybody opens the
       panel, so that is fetched on its own, once the page has signed in. It
       is one small indexed count. */
    async function badge() {
        if (!token() || !navCount) return;
        try {
            const data = await call(`${LEADS_URL}?status=new`, "GET");
            counts = data.counts || counts;
            navCount.textContent = counts.new ? String(counts.new) : "";
            navCount.hidden = !counts.new;
        } catch (e) { /* the panel will say so when opened */ }
    }
    const rail = document.getElementById("admin-rail");
    if (rail) {
        // admin.js reveals the rail once the session is verified.
        const once = new MutationObserver(() => {
            if (rail.style.display !== "none") { once.disconnect(); badge(); }
        });
        once.observe(rail, { attributes: true, attributeFilter: ["style"] });
        if (rail.style.display !== "none") { once.disconnect(); badge(); }
    }
})();

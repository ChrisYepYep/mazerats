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
    function sessionGone(err) {
        if (!err || err.status !== 401) return false;
        leadsEl.innerHTML = '<p class="admin-empty">Your session has expired. <button type="button" class="ctl-btn" data-de-reload>Sign in again</button></p>';
        const btn = leadsEl.querySelector("[data-de-reload]");
        if (btn) btn.addEventListener("click", () => location.reload());
        recordsEl.innerHTML = "";
        return true;
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

    async function loadAll() {
        leadsEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        recordsEl.innerHTML = "";
        try {
            const [leadData, flagData, rooms, events] = await Promise.all([
                call(`${LEADS_URL}?status=${encodeURIComponent(leadStatus)}`, "GET"),
                call(`${FLAGS_URL}?full=1`, "GET"),
                Api.getRoomsFull(token()),
                Api.getEventsFull(token())
            ]);
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
            if (sessionGone(err)) return;
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
            if (!sessionGone(err)) alert(`Could not load the leads: ${err.message}`);
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
        if (lead.from) bits.push(`Discord: ${lead.from.name} (signed in)`);
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

        const actions = document.createElement("div");
        actions.className = "admin-row-actions";
        if (lead.status !== "accepted") actions.appendChild(button("Accept…", () => toggleAccept(row, lead)));
        if (lead.status === "new") actions.appendChild(button("Reject", () => reject(lead)));
        if (lead.status !== "new") actions.appendChild(button("Reopen", () => review(lead, { status: "new" })));
        if (lead.ip) actions.appendChild(button("Ban IP", () => ban(lead.ip), lead.ip));
        actions.appendChild(button("Delete", () => remove(lead), "", "admin-delete-btn"));

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
        const creditName = lead.habboName || (lead.from && lead.from.name) || "";
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
            <div class="ctl-actions"><button type="button" class="ctl-btn" data-f="go">Accept</button></div>`;
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
    async function review(lead, body) {
        try {
            const out = await call(LEADS_URL, "PATCH", { id: lead.id, ...body });
            if (out && out.promoted && out.promoted.length) lead.promoted = out.promoted;
            await Promise.all([reloadLeads(), reloadFlags()]);
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
            return true;
        } catch (err) {
            if (!sessionGone(err)) alert(`Could not save that: ${err.message}`);
            return false;
        }
    }

    function reject(lead) {
        const hasShots = lead.images && lead.images.length;
        const note = prompt(`Reject this lead?${hasShots ? " Its screenshots will be deleted." : ""}\n\nNote (optional, admins only):`, "");
        if (note === null) return;
        review(lead, { status: "rejected", note });
    }

    async function remove(lead) {
        if (!confirm("Delete this lead and any screenshots with it? This cannot be undone.")) return;
        try {
            await call(`${LEADS_URL}?id=${encodeURIComponent(lead.id)}`, "DELETE");
            await Promise.all([reloadLeads(), reloadFlags()]);
        } catch (err) {
            if (!sessionGone(err)) alert(`Could not delete it: ${err.message}`);
        }
    }

    async function ban(ip) {
        const reason = prompt(`Ban ${ip} from the contact form and from sending leads?\n\nReason (optional):`, "Missing Pieces spam");
        if (reason === null) return;
        try {
            await call("/.netlify/functions/bans", "POST", { ip, reason });
            flash(`Banned ${ip}. It is listed under Bans.`);
        } catch (err) {
            if (!sessionGone(err)) alert(`Could not ban it: ${err.message}`);
        }
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
        actions.appendChild(button(flag ? "Edit" : "Mark…", () => {
            openEditor = openEditor === k ? null : k;
            renderRecords();
        }));
        if (flag) actions.appendChild(button("Clear", () => clearFlag(rec), "", "admin-delete-btn"));

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
        const ticked = new Set(flag ? flag.pieces : DeadEnds.suggested(rec.raw, rec.type));
        const form = document.createElement("div");
        form.className = "de-editor";
        form.innerHTML = `
            ${flag ? "" : `<p class="de-hint">Pre-ticked from what the record looks like it is missing. Untick anything that isn't really missing.</p>`}
            <span class="ctl-label">Missing</span>
            <div class="de-pieces">${DeadEnds.piecesFor(rec.type).map(p => `
                <label class="de-check" title="${escapeHtml(p.ask)}"><input type="checkbox" data-mark="${p.key}"${ticked.has(p.key) ? " checked" : ""}> ${escapeHtml(p.label)}</label>`).join("")}
            </div>
            <span class="ctl-label">What exactly (shown to visitors)</span>
            <textarea class="ctl-input de-note" maxlength="${DeadEnds.NOTE_MAX}" rows="2" placeholder="e.g. The secret room behind the bookcase in room 12">${escapeHtml(flag ? flag.note : "")}</textarea>
            <div class="ctl-actions">
                <button type="button" class="ctl-btn" data-f="save">Save</button>
                <button type="button" class="ctl-btn" data-f="cancel">Cancel</button>
            </div>
            <p class="ctl-status" data-f="status"></p>`;

        form.querySelector('[data-f="cancel"]').addEventListener("click", () => { openEditor = null; renderRecords(); });
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
                openEditor = null;
                await reloadFlags();
            } catch (err) {
                if (sessionGone(err)) return;
                status.textContent = err.message;
                status.classList.add("is-bad");
            }
        });
        return form;
    }

    async function clearFlag(rec) {
        if (!confirm(`Take "${rec.name}" off the Missing Pieces list? It will show as complete everywhere on the site.`)) return;
        try {
            await call(`${FLAGS_URL}?type=${rec.type}&id=${encodeURIComponent(rec.id)}`, "DELETE");
            await reloadFlags();
        } catch (err) {
            if (!sessionGone(err)) alert(`Could not clear it: ${err.message}`);
        }
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

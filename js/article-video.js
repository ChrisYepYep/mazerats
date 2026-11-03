/* ===========================================================
   Maze Rats: a video in an article (2 Nov 2026, the owner's)

   The {{video}} block of THE EMBED CONTRACT (js/article-text.js):

       {{video key=videos/<article>/<time>-<name>.mp4 poster=articles/... w=1280 h=720 len=12.5}}

   ON THE PAGE (render). The still, a play button and the length, and
   nothing of the video fetched until the button is pressed: a video is up
   to 50MB, and an article is read on phones. Pressed, it plays with the
   browser's own controls (keyboard, captions menu, full screen, AirPlay
   all theirs), inline on a phone (playsinline), with sound, because a
   press is the reader asking for it; it never starts by itself. Space or
   K, the arrows, M and F work on it once it has focus. Starting one pauses
   any other on the page, and the article window pauses them all when it
   closes (js/articles.js).

   IN THE WARREN (editorButton, "Video" on the article's formatting bar).
   Pick an MP4 or WebM of 50MB at most; it is sent in pieces to
   netlify/functions/upload-video.js with a progress bar, Cancel, and Try
   again where a piece fails (it carries on from that piece). Then a still
   is chosen: a frame from the video itself (the first second, or any
   moment on the slider), drawn on a canvas and uploaded as a picture, or
   a picture of the admin's own. The block's line goes in at the caret.
   A cancel deletes what was sent; anything left behind by a closed tab or
   a session that ran out is deleted by the server's sweep (_videos.js).

   Its look is css/article-video.css, which this loads into whichever page
   (or the Warren's preview frame) it draws in.
   =========================================================== */
(function () {
    "use strict";
    if (!window.ArticleEmbeds) return;

    const CSS = "css/article-video.css?v=1";
    const VIDEO_URL = "/.netlify/functions/video?key=";
    const IMAGE_URL = "/.netlify/functions/image?key=";
    const UPLOAD_URL = "/.netlify/functions/upload-video";
    const MAX_BYTES = 50 * 1024 * 1024;
    const KEY = /^videos\/[a-z0-9-]{1,80}\/\d{13}-[a-z0-9-]{1,80}\.(mp4|webm)$/;
    const POSTER = /^articles\/[A-Za-z0-9._/-]{1,240}$/;
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function ensureCss(doc) {
        if (!doc || !doc.head || doc.querySelector("link[data-article-video-css]")) return;
        const l = doc.createElement("link");
        l.rel = "stylesheet";
        l.href = CSS;
        l.setAttribute("data-article-video-css", "");
        // Not a site colour to the Warren's Recolour catalogue: every colour here is a palette variable.
        l.setAttribute("data-recolour-skip", "");
        doc.head.appendChild(l);
    }

    // 75 -> "1:15", 3725 -> "1:02:05".
    function clock(s) {
        s = Math.max(0, Math.round(Number(s) || 0));
        const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
        return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(sec).padStart(2, "0");
    }
    // 75 -> "1 minute 15 seconds", for a screen reader.
    function spoken(s) {
        s = Math.max(1, Math.round(Number(s) || 0));
        const m = Math.floor(s / 60), sec = s % 60;
        const part = (n, w) => n ? `${n} ${w}${n === 1 ? "" : "s"}` : "";
        return [part(m, "minute"), part(sec, "second")].filter(Boolean).join(" ");
    }
    const mb = n => (n / (1024 * 1024)).toFixed(1) + " MB";

    /* ------------------------------------------------------------ the page */

    const watched = new WeakSet();
    // One playing at a time on a page: a second started pauses the first.
    function oneAtATime(doc) {
        if (watched.has(doc)) return;
        watched.add(doc);
        doc.addEventListener("play", e => {
            if (!e.target || !e.target.classList || !e.target.classList.contains("vid-el")) return;
            doc.querySelectorAll("video.vid-el").forEach(v => { if (v !== e.target && !v.paused) v.pause(); });
        }, true);
    }

    function render(el, data) {
        const a = (data && data.attrs) || {};
        if (!KEY.test(a.key || "")) throw new Error("not a video's address");
        const doc = el.ownerDocument;
        ensureCss(doc);
        oneAtATime(doc);
        const w = Number(a.w) || 0, h = Number(a.h) || 0;
        const len = Number(a.len) || 0;
        const poster = POSTER.test(a.poster || "") ? IMAGE_URL + a.poster : "";
        el.classList.add("art-video");
        el.innerHTML = `
            <div class="vid-frame">
                <video class="vid-el" preload="none" playsinline webkit-playsinline
                    ${poster ? `poster="${esc(poster)}"` : ""} src="${esc(VIDEO_URL + a.key)}" aria-label="The article's video"></video>
                <button type="button" class="vid-play" aria-label="Play the video${len ? `, ${esc(spoken(len))} long` : ""}">
                    <span class="vid-play-icon" aria-hidden="true"></span>
                </button>
                <span class="vid-len" aria-hidden="true"${len ? "" : " hidden"}>${len ? esc(clock(len)) : ""}</span>
                <p class="vid-error" role="status" hidden></p>
            </div>`;
        const frame = el.querySelector(".vid-frame");
        // Its own shape before a byte has loaded, and a tall phone video no taller than the window can show.
        if (w && h) frame.style.setProperty("--vid-r", String(w / h));
        if (!poster) frame.classList.add("no-poster");
        const video = el.querySelector("video");
        const btn = el.querySelector(".vid-play");
        const lenEl = el.querySelector(".vid-len");
        const errEl = el.querySelector(".vid-error");

        function start() {
            frame.classList.add("is-started");
            video.controls = true;
            video.tabIndex = 0;
            const p = video.play();
            if (p && p.catch) p.catch(() => { /* the controls are there to press */ });
            video.focus({ preventScroll: true });
        }
        btn.addEventListener("click", start);
        video.addEventListener("loadedmetadata", () => {
            if (!len && isFinite(video.duration) && video.duration > 0) { lenEl.textContent = clock(video.duration); lenEl.hidden = false; }
        });
        video.addEventListener("error", () => {
            if (!frame.classList.contains("is-started")) return;
            frame.classList.add("is-broken");
            errEl.textContent = "This video couldn't be played just now. Try again in a minute.";
            errEl.hidden = false;
        });
        /* The keys a player's own would answer, once the video has focus.
           Taken here (and the browser's default stopped) so they are the
           same in every browser and never also scroll the article. */
        video.addEventListener("keydown", e => {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            /* Space is the browser's own (every one's controls play and pause
               on it, Chromium's on the key coming up, whatever is done here):
               only kept from scrolling the article. */
            if (k === " ") { /* the browser's */ }
            else if (k === "k") { if (video.paused) video.play().catch(() => {}); else video.pause(); }
            else if (k === "ArrowLeft" || k === "j") video.currentTime = Math.max(0, video.currentTime - 5);
            else if (k === "ArrowRight" || k === "l") video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
            else if (k === "m") video.muted = !video.muted;
            else if (k === "f") {
                const d = video.ownerDocument;
                if (d.fullscreenElement) d.exitFullscreen().catch(() => {});
                else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
                else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
            } else return;
            e.preventDefault();
            e.stopPropagation();
        });
    }

    /* ------------------------------------------------------------ the Warren */

    // What the bytes are (as netlify/functions/_videos.js sniffs the first piece).
    async function sniff(file) {
        const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
        const text = (from, to) => String.fromCharCode(...b.slice(from, to));
        if (b.length >= 12 && text(4, 8) === "ftyp") return text(8, 12) === "qt  " ? "quicktime" : "video/mp4";
        if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return text(0, b.length).includes("webm") ? "video/webm" : "matroska";
        return null;
    }

    function pickFile(doc, accept) {
        return new Promise(resolve => {
            const input = doc.createElement("input");
            input.type = "file";
            input.accept = accept;
            input.hidden = true;
            let done = false;
            const finish = f => { if (done) return; done = true; input.remove(); resolve(f); };
            input.addEventListener("change", () => finish(input.files && input.files[0] || null));
            input.addEventListener("cancel", () => finish(null));
            doc.body.appendChild(input);
            input.click();
        });
    }

    // Base64 of a stretch of the file, by the browser's own encoder.
    function base64Of(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(",") + 1)); };
            r.onerror = () => reject(r.error || new Error("The file couldn't be read."));
            r.readAsDataURL(blob);
        });
    }

    /* One request to upload-video.js. An XHR rather than fetch for the
       upload's own progress, and abortable for Cancel. Rejects with an
       Error carrying .status (0 for the network) and .data. */
    function send(token, method, url, body, onProgress, holder, timeoutMs) {
        return new Promise((resolve, reject) => {
            const x = new XMLHttpRequest();
            if (holder) holder.xhr = x;
            x.open(method, url);
            x.setRequestHeader("Content-Type", "application/json");
            x.setRequestHeader("x-admin-token", token);
            x.timeout = timeoutMs || 90000;
            if (onProgress && x.upload) x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
            const fail = (status, data, msg) => {
                const err = new Error(msg || (data && data.error) || (status ? `The server said ${status}.` : "The connection dropped."));
                err.status = status; err.data = data || {};
                reject(err);
            };
            x.onload = () => {
                let data = null;
                try { data = JSON.parse(x.responseText || "null"); } catch (e) { /* not JSON: a platform page */ }
                if (x.status >= 200 && x.status < 300) resolve(data || {});
                else fail(x.status, data);
            };
            x.onerror = () => fail(0, null);
            x.ontimeout = () => fail(0, null, "The upload took too long to answer.");
            x.onabort = () => { const e = new Error("Cancelled"); e.cancelled = true; reject(e); };
            x.send(body === undefined ? null : body);
        });
    }
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // Worth sending again: the network, a timeout, the server busy or failing.
    const retryable = err => !err.cancelled && (err.status === 0 || err.status === 429 || err.status >= 500);

    /* The dialog: the Warren's own box (.wr-dialog), modal, keyboard-held.
       Resolves when it is done with; insert(ctx) waits on it. */
    function openDialog(ctx, file, type) {
        const doc = document;
        ensureCss(doc);
        const token = () => (typeof ctx.token === "function" ? ctx.token() : "") || "";
        const job = { key: "", chunks: 0, chunkSize: 0, next: 0, sent: 0, holder: {}, cancelled: false, finished: false };
        const overlay = doc.createElement("div");
        overlay.className = "modal-overlay open wr-ui wr-dialog vid-up-overlay";
        const titleId = "vid-up-title-" + Date.now();
        overlay.innerHTML = `
            <div class="modal confirm-modal vid-up" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
                <div class="chrome-titlebar">
                    <h2 id="${titleId}">Add a video</h2>
                    <button type="button" class="chrome-close" aria-label="Cancel" data-vid="cancel">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="vid-up-file"><span class="vid-up-name">${esc(file.name || "video")}</span> <span class="vid-up-size">${esc(mb(file.size))}</span></p>
                    <div class="vid-up-stage" data-stage="upload">
                        <div class="vid-up-bar" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="vid-up-fill"></span></div>
                        <p class="vid-up-pct"><span data-pct>0%</span> <span class="vid-up-of" data-of></span></p>
                    </div>
                    <div class="vid-up-stage" data-stage="poster" hidden>
                        <div class="vid-up-preview"><video muted playsinline preload="auto" aria-label="The video, to pick its still from"></video></div>
                        <label class="vid-up-slider"><span>Still from <output data-at>0:00</output></span>
                            <input type="range" min="0" max="1" step="0.1" value="0" data-seek aria-label="Where the still is taken from, in seconds"></label>
                    </div>
                    <p class="vid-up-msg" role="status" aria-live="polite" data-msg>Getting ready…</p>
                    <div class="admin-form-actions vid-up-actions" data-actions></div>
                </div>
            </div>`;
        doc.body.appendChild(overlay);
        const $ = s => overlay.querySelector(s);
        const msg = $("[data-msg]"), bar = $(".vid-up-bar"), fill = $(".vid-up-fill"), pctEl = $("[data-pct]"), ofEl = $("[data-of]");
        const actions = $("[data-actions]");
        const preview = $(".vid-up-preview video"), seek = $("[data-seek]"), atEl = $("[data-at]");

        // Modal as the Warren's own boxes are: the rest of the page inert, focus back where it was after.
        const returnTo = doc.activeElement;
        const madeInert = Array.from(doc.body.children).filter(n => n !== overlay && !n.inert);
        madeInert.forEach(n => { n.inert = true; });
        const leaving = e => { if (!job.finished) { e.preventDefault(); e.returnValue = ""; } };
        window.addEventListener("beforeunload", leaving);

        let settle;
        const done = new Promise(r => { settle = r; });
        let closed = false;
        function close(result) {
            if (closed) return;
            closed = true;
            window.removeEventListener("beforeunload", leaving);
            try { preview.removeAttribute("src"); preview.load(); } catch (e) { /* gone */ }
            madeInert.forEach(n => { n.inert = false; });
            overlay.remove();
            if (returnTo && returnTo.focus) try { returnTo.focus({ preventScroll: true }); } catch (e) { /* gone */ }
            settle(result);
        }

        // The buttons for the moment: [[label, action, kind]], the first focused.
        function buttons(list, focusFirst) {
            actions.innerHTML = list.map(([label, act, kind]) =>
                `<button type="button" class="admin-action-pill${kind === "solid" ? " admin-pill-solid" : kind === "danger" ? " admin-pill-danger" : ""}" data-vid="${act}">${esc(label)}</button>`).join("");
            if (focusFirst !== false) { const b = actions.querySelector("button"); if (b) b.focus(); }
        }
        function say(text, isError) {
            msg.textContent = text;
            msg.classList.toggle("is-error", !!isError);
        }
        function progress(bytes) {
            const p = Math.max(0, Math.min(100, Math.floor(bytes / file.size * 100)));
            fill.style.width = p + "%";
            bar.setAttribute("aria-valuenow", String(p));
            pctEl.textContent = p + "%";
            ofEl.textContent = `${mb(Math.min(bytes, file.size))} of ${mb(file.size)}`;
        }

        const api = (op, extra, onProgress) => send(token(), "POST", UPLOAD_URL, JSON.stringify(Object.assign({ op }, extra)), onProgress, job.holder);
        // What was sent is deleted (the server's sweep catches it if this never arrives).
        function discard() {
            if (!job.key) return;
            const key = job.key;
            job.key = "";
            send(token(), "DELETE", `${UPLOAD_URL}?key=${encodeURIComponent(key)}`).catch(() => { /* the sweep will */ });
        }

        async function cancel() {
            if (closed) return;
            if (job.sent > 0 && !job.stopped) {
                const sure = await (ctx.ask ? ctx.ask(job.finished ? "Leave without adding this video? The upload is deleted." : "Stop uploading this video? What has been sent is deleted.", { danger: true }) : Promise.resolve(true));
                if (!sure || closed) return;
            }
            job.cancelled = true;
            if (job.holder.xhr) try { job.holder.xhr.abort(); } catch (e) { /* done */ }
            discard();
            close(null);
        }

        // A stop the admin can do nothing about here but read and close (wrong type, refused, signed out).
        let sessionError = null;
        function fatal(err) {
            job.stopped = true;
            if (err && err.status === 401) {
                sessionError = err;
                say("Your Warren session has ended, so the upload stopped. What was sent is never shown, and the site deletes it within a few hours. Sign in again, then add the video again.", true);
            } else {
                say(err && err.message ? err.message : "The upload stopped.", true);
            }
            discard();
            buttons([["Close", "close", "solid"]]);
        }

        async function upload() {
            job.stopped = false;
            say("Uploading…");
            buttons([["Cancel", "cancel", "danger"]]);
            try {
                if (!job.key) {
                    const s = await api("start", { prefix: (ctx.article && (ctx.article.id || ctx.article.title)) || "article", filename: file.name || "video", size: file.size, type });
                    job.key = s.key; job.chunks = s.chunks; job.chunkSize = s.chunkSize; job.next = 0; job.sent = 0;
                }
                let rounds = 0;
                for (;;) {
                    while (job.next < job.chunks) {
                        const n = job.next;
                        const from = n * job.chunkSize, to = Math.min(file.size, from + job.chunkSize);
                        const data = await base64Of(file.slice(from, to));
                        if (job.cancelled) return;
                        let tries = 0;
                        for (;;) {
                            try {
                                await api("chunk", { key: job.key, n, data }, f => progress(from + f * (to - from) * 0.98));
                                break;
                            } catch (err) {
                                if (err.cancelled || job.cancelled) return;
                                // Twice more on its own, then the admin decides.
                                if (retryable(err) && tries < 2) { tries++; say(`A piece didn't get through. Trying again (${tries} of 2)…`); await wait(tries === 1 ? 1500 : 4000); say("Uploading…"); continue; }
                                throw err;
                            }
                        }
                        job.next = n + 1;
                        job.sent = to;
                        progress(to);
                    }
                    say("Putting it together…");
                    try {
                        await api("finish", { key: job.key });
                        break;
                    } catch (err) {
                        // A piece the server never got: those again, then finish again.
                        if (err.status === 409 && Array.isArray(err.data.missing) && err.data.missing.length && rounds++ < 2) {
                            const again = err.data.missing.slice();
                            for (const n of again) {
                                const from = n * job.chunkSize, to = Math.min(file.size, from + job.chunkSize);
                                await api("chunk", { key: job.key, n, data: await base64Of(file.slice(from, to)) });
                            }
                            continue;
                        }
                        throw err;
                    }
                }
                job.finished = true;
                progress(file.size);
                if (typeof ctx.track === "function") ctx.track(job.key);
                choosePoster();
            } catch (err) {
                if (err.cancelled || job.cancelled || closed) return;
                if (err.status === 401 || err.status === 403 || err.status === 413 || (err.data && err.data.gone)) { fatal(err); return; }
                if (err.status === 400 && /MP4 or WebM/.test(err.message)) { fatal(err); return; }
                // Stopped part way: Try again carries on from the piece that failed.
                job.stopped = true;
                progress(job.sent);
                const at = Math.floor(job.sent / file.size * 100);
                const why = String(err.message || "the connection dropped").replace(/[.!?]?\s*$/, ".");
                say(`The upload stopped at ${at}%: ${why} Try again to carry on from there.`, true);
                buttons([["Try again", "retry", "solid"], ["Cancel", "cancel", "danger"]]);
            }
        }

        /* ---- the still */
        let duration = 0;
        function choosePoster() {
            $('[data-stage="upload"]').hidden = true;
            $('[data-stage="poster"]').hidden = false;
            overlay.querySelector("h2").textContent = "Choose its still";
            say("Uploaded. Loading it to take a still from…");
            buttons([["Upload a picture instead", "picture"], ["Cancel", "cancel", "danger"]], false);
            preview.addEventListener("error", () => {
                say("The video is uploaded, but this browser can't play it, so no still can be taken from it (and some visitors may not be able to play it either: an MP4 in H.264 plays everywhere). Upload a picture for its still, add it without one, or Cancel.", true);
                buttons([["Upload a picture instead", "picture", "solid"], ["Add without a still", "nostill"], ["Cancel", "cancel", "danger"]]);
            }, { once: true });
            preview.addEventListener("loadedmetadata", async () => {
                duration = await durationOf(preview);
                seek.max = String(Math.max(0.1, Math.floor(duration * 10) / 10));
                const first = Math.min(1, duration / 2);
                seek.value = String(first);
                await seekTo(first);
                say("Slide to the moment to use as its still, or upload a picture of your own.");
                buttons([["Use this still", "frame", "solid"], ["Upload a picture instead", "picture"], ["Cancel", "cancel", "danger"]]);
            }, { once: true });
            preview.src = VIDEO_URL + job.key;
        }
        /* A recording straight off a browser (a WebM from MediaRecorder) says
           nothing of its length until its end is read: ask for a moment far
           past the end and the browser finds it. */
        function durationOf(v) {
            if (isFinite(v.duration) && v.duration > 0) return Promise.resolve(v.duration);
            return new Promise(resolve => {
                const found = () => {
                    if (!isFinite(v.duration)) return;
                    v.removeEventListener("durationchange", found);
                    resolve(v.duration);
                };
                v.addEventListener("durationchange", found);
                v.currentTime = 1e7;
                setTimeout(() => resolve(isFinite(v.duration) ? v.duration : 0), 15000);
            });
        }
        function seekTo(t) {
            return new Promise(resolve => {
                atEl.textContent = clock(Math.floor(t)) + "." + Math.floor((t % 1) * 10);
                if (Math.abs(preview.currentTime - t) < 0.01 && preview.readyState >= 2) { resolve(); return; }
                const ok = () => { preview.removeEventListener("seeked", ok); resolve(); };
                preview.addEventListener("seeked", ok);
                preview.currentTime = t;
                setTimeout(ok, 8000);
            });
        }
        let seekTimer = null;
        seek.addEventListener("input", () => {
            clearTimeout(seekTimer);
            const t = Number(seek.value) || 0;
            atEl.textContent = clock(Math.floor(t)) + "." + Math.floor((t % 1) * 10);
            seekTimer = setTimeout(() => seekTo(t), 80);
        });

        // The frame on show, as a JPEG no wider than 1280.
        function grabFrame() {
            return new Promise((resolve, reject) => {
                const vw = preview.videoWidth, vh = preview.videoHeight;
                if (!vw || !vh) { reject(new Error("The video hasn't shown a picture yet.")); return; }
                const scale = Math.min(1, 1280 / vw);
                const c = doc.createElement("canvas");
                c.width = Math.round(vw * scale); c.height = Math.round(vh * scale);
                try {
                    c.getContext("2d").drawImage(preview, 0, 0, c.width, c.height);
                    c.toBlob(b => b ? resolve(new File([b], "still.jpg", { type: "image/jpeg" })) : reject(new Error("The still couldn't be made.")), "image/jpeg", 0.86);
                } catch (e) { reject(new Error("The still couldn't be made.")); }
            });
        }

        async function finishWith(posterFile) {
            buttons([], false);
            let poster = "";
            try {
                if (posterFile) {
                    say("Uploading the still…");
                    const r = await ctx.upload(posterFile, "articles");
                    poster = r && r.key && POSTER.test(r.key) ? r.key : "";
                }
            } catch (err) {
                if (err && err.status === 401) { fatal(err); return; }
                say(`The still couldn't be uploaded: ${err.message || "try again"}.`, true);
                buttons([["Use this still", "frame", "solid"], ["Upload a picture instead", "picture"], ["Cancel", "cancel", "danger"]]);
                return;
            }
            const attrs = { key: job.key, poster };
            if (preview.videoWidth && preview.videoHeight) { attrs.w = preview.videoWidth; attrs.h = preview.videoHeight; }
            if (duration > 0 && duration < 100000) attrs.len = Math.round(duration * 10) / 10;
            const line = (ctx.embedLine || (() => ""))("video", attrs);
            if (!line) { say("The video's line couldn't be written. Cancel, and try again.", true); buttons([["Cancel", "cancel", "danger"]]); return; }
            ctx.insert(line);
            close(line);
        }

        overlay.addEventListener("click", async e => {
            const b = e.target.closest("[data-vid]");
            if (!b) return;
            const act = b.dataset.vid;
            if (act === "cancel") cancel();
            else if (act === "close") close(null);
            else if (act === "retry") upload();
            else if (act === "nostill") finishWith(null);
            else if (act === "frame") {
                try { finishWith(await grabFrame()); }
                catch (err) { say(err.message, true); }
            } else if (act === "picture") {
                const f = await pickFile(doc, "image/png,image/jpeg,image/gif,image/webp");
                if (f && !closed) finishWith(f);
            }
        });
        // Escape is Cancel; Tab stays in the box.
        overlay.addEventListener("keydown", e => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (sessionError || job.stopped && !job.key) close(null); else cancel(); return; }
            if (e.key !== "Tab") return;
            const f = Array.from(overlay.querySelectorAll("button, input, video[controls], [tabindex]:not([tabindex='-1'])")).filter(n => !n.disabled && n.offsetParent !== null);
            if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        upload();
        return done.then(r => { if (sessionError) throw sessionError; return r; });
    }

    async function insert(ctx) {
        const file = await pickFile(document, "video/mp4,video/webm,.mp4,.m4v,.webm");
        if (!file) return;
        const tell = t => (ctx.tell ? ctx.tell(t) : Promise.resolve());
        if (!file.size) { await tell("That file is empty."); return; }
        if (file.size > MAX_BYTES) {
            await tell(`That video is ${mb(file.size)}. The most a video can be is 50 MB: trim it, or save it at a lower quality, then try again.`);
            return;
        }
        const type = await sniff(file);
        if (type === "quicktime") { await tell("That's a QuickTime (.mov) video, which most browsers can't play. Save it as an MP4 and try again."); return; }
        if (type === "matroska") { await tell("That's a Matroska (.mkv) video, which browsers can't play. Save it as an MP4 or WebM and try again."); return; }
        if (!type) { await tell("That file isn't an MP4 or WebM video."); return; }
        await openDialog(ctx, file, type);
    }

    window.ArticleEmbeds.register("video", {
        label: "Video",
        render,
        editorButton: {
            label: "Video",
            title: "Video: upload an MP4 or WebM (50 MB at most) and put it here, at the caret, with a still from it",
            insert
        }
    });
})();

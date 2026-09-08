/* Makes a slow zooming GIF of the atlas, from inside the editor.

   You frame the shot the way you would frame it by hand — move the map to
   where the animation should begin and press "Set start", move it to where
   it should end and press "Set end" — and this walks between the two.

   ---------- how the frames are made ----------

   The obvious way is to photograph the page sixty times, and it cannot be
   done: the only route from live DOM to a canvas is an SVG foreignObject,
   and Chrome taints a canvas that has had one drawn onto it, so the pixels
   can never be read back. Tried, measured, dead end.

   So the map is redrawn onto a canvas from its own parts, which are all
   things a canvas can hold without tainting anything — checked, all four:
   the layer pictures are same-origin, the pen strokes are plain SVG, the
   paper's stains are the same feTurbulence the stylesheet generates, and
   the lettering is a font the page has already loaded.

   It is drawn ONCE, at the size of the widest frame, and every frame after
   that is a crop of that one still. That is what makes this quick enough to
   sit in an editor: a hundred frames is one render and a hundred
   drawImages, not a hundred renders.

   Geometry comes from the live DOM rather than from the records, on
   purpose. The map's own renderer has already worked out where a name sits,
   how big it is, which way a footprint points and what a zoom band has
   faded — reading that back is one source of truth. Computing it again here
   would be a second renderer, and a second renderer is a thing that drifts. */
window.WizardGif = (function () {
    "use strict";

    // ---------- reading the live map ----------

    /* Everything below works in MAP pixels — the coordinate system the
       canvas element itself is laid out in, where offsetLeft and offsetWidth
       are already the numbers we want and the page's zoom is just a
       transform on top. */
    function mapSize(canvasEl) {
        return { w: canvasEl.offsetWidth, h: canvasEl.offsetHeight };
    }

    // The scale the map is currently drawn at, read off its transform.
    function liveScale(canvasEl) {
        const m = new DOMMatrixReadOnly(getComputedStyle(canvasEl).transform);
        return m.a || 1;
    }

    /* What the frame is looking at right now, as a rectangle in map pixels.
       This is what "Set start" and "Set end" each remember. */
    function currentShot(stageEl, canvasEl) {
        const scale = liveScale(canvasEl);
        const stage = stageEl.getBoundingClientRect();
        const canvas = canvasEl.getBoundingClientRect();
        return {
            cx: ((stage.left + stage.width / 2) - canvas.left) / scale,
            cy: ((stage.top + stage.height / 2) - canvas.top) / scale,
            w: stage.width / scale
        };
    }

    // ---------- drawing one element ----------

    /* Puts the context into an element's own space: its box at (0, 0), its
       transform applied about its own origin, so a rotated footprint or a
       scaled name draws exactly where the page has it. */
    function enterElement(ctx, el) {
        const style = getComputedStyle(el);
        const origin = style.transformOrigin.split(" ").map(parseFloat);
        const ox = origin[0] || 0;
        const oy = origin[1] || 0;
        ctx.save();
        ctx.globalAlpha *= Number(style.opacity) || 1;
        ctx.translate(el.offsetLeft + ox, el.offsetTop + oy);
        if (style.transform && style.transform !== "none") {
            const m = new DOMMatrixReadOnly(style.transform);
            ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        }
        ctx.translate(-ox, -oy);
    }

    const cache = new Map();

    function load(src) {
        if (cache.has(src)) return cache.get(src);
        const p = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("could not load " + src.slice(0, 60)));
            img.src = src;
        });
        cache.set(src, p);
        return p;
    }

    const urlIn = value => {
        const m = /url\(["']?(.*?)["']?\)/.exec(value || "");
        return m ? m[1] : null;
    };

    // ---------- the paper ----------

    /* The sheet, rebuilt from the same four layers the stylesheet stacks:
       the lit gradient underneath, the two stains, and the grain on top.
       Read from the page's own custom properties rather than copied, so the
       GIF cannot end up on last month's parchment. */
    async function drawPaper(ctx, w, h, paperEl) {
        const root = getComputedStyle(document.documentElement);
        const tone = name => root.getPropertyValue(name).trim();

        // radial-gradient(ellipse at 50% 42%, lit 0%, paper 38%, deep 100%)
        ctx.save();
        ctx.translate(w * 0.5, h * 0.42);
        ctx.scale(1, h / w);
        const reach = Math.hypot(w * 0.5, (w / h) * h * 0.58);
        const sheet = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
        sheet.addColorStop(0, tone("--wiz-paper-lit") || "#ecd6ad");
        sheet.addColorStop(0.38, tone("--wiz-paper") || "#e0c193");
        sheet.addColorStop(1, tone("--wiz-paper-deep") || "#c39c65");
        ctx.fillStyle = sheet;
        ctx.fillRect(-w, -h * 2, w * 2, h * 4);
        ctx.restore();

        // The stains, each laid once across the whole sheet, and the grain
        // tiled at the size the stylesheet tiles it.
        for (const name of ["--wiz-stain-coarse", "--wiz-stain-fine"]) {
            const src = urlIn(root.getPropertyValue(name));
            if (!src) continue;
            try { ctx.drawImage(await load(src), 0, 0, w, h); } catch (e) { /* a stain is not worth failing over */ }
        }
        const grainSrc = urlIn(root.getPropertyValue("--wiz-grain"));
        if (grainSrc) {
            try {
                const grain = await load(grainSrc);
                const tile = ctx.createPattern(grain, "repeat");
                ctx.save();
                ctx.fillStyle = tile;
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
            } catch (e) { /* same */ }
        }

        /* The vignette where the sheet meets the table. An inset box-shadow
           has no canvas equivalent, so it is four edge gradients — which is
           what an inset shadow on a rectangle looks like anyway. */
        const shade = paperEl ? getComputedStyle(paperEl).boxShadow : "";
        const depth = /(\d+)px/.exec(shade || "");
        const reachIn = Math.min(w, h) * 0.12 * (depth ? Math.min(2, parseInt(depth[1], 10) / 300) : 1);
        const edges = [
            [0, 0, reachIn, 0], [w, 0, w - reachIn, 0],
            [0, 0, 0, reachIn], [0, h, 0, h - reachIn]
        ];
        for (const [x0, y0, x1, y1] of edges) {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, "rgba(124, 84, 42, 0.20)");
            g.addColorStop(1, "rgba(124, 84, 42, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }
    }

    // ---------- the still ----------

    async function renderStill(stageEl, canvasEl, width, onProgress) {
        const { w: mapW, h: mapH } = mapSize(canvasEl);
        const scale = width / mapW;
        const still = document.createElement("canvas");
        still.width = Math.round(width);
        still.height = Math.round(mapH * scale);
        const ctx = still.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.scale(scale, scale);

        const paperEl = canvasEl.querySelector(".wiz-paper");
        await drawPaper(ctx, mapW, mapH, paperEl);
        if (onProgress) onProgress(0.15);

        // An uploaded background, if this map has one, sits on the paper.
        for (const bg of canvasEl.querySelectorAll("img.wiz-bg")) {
            try { ctx.drawImage(await load(bg.currentSrc || bg.src), 0, 0, mapW, mapH); } catch (e) {}
        }

        // The pictures, each with its own turn, flip and fading.
        for (const layer of canvasEl.querySelectorAll("img.wiz-layer")) {
            if (Number(getComputedStyle(layer).opacity) < 0.02) continue;
            try {
                const img = await load(layer.currentSrc || layer.src);
                enterElement(ctx, layer);
                const style = getComputedStyle(layer);
                if (style.filter && style.filter !== "none") ctx.filter = style.filter;
                if (style.mixBlendMode && style.mixBlendMode !== "normal") {
                    ctx.globalCompositeOperation = style.mixBlendMode;
                }
                ctx.drawImage(img, 0, 0, layer.offsetWidth, layer.offsetHeight);
                ctx.filter = "none";
                ctx.globalCompositeOperation = "source-over";
                ctx.restore();
            } catch (e) {}
        }
        if (onProgress) onProgress(0.45);

        /* The trails: footprints are sprites in rotated boxes, pen strokes
           and arrows are plain SVG. Both are drawn in the order the page has
           them, so a stroke that should sit under a name still does. */
        for (const trail of canvasEl.querySelectorAll(".wiz-trail")) {
            if (Number(getComputedStyle(trail).opacity) < 0.02) continue;
            enterElement(ctx, trail);
            for (const print of trail.querySelectorAll(".wiz-print")) {
                const src = urlIn(getComputedStyle(print).backgroundImage);
                enterElement(ctx, print);
                try {
                    if (src) ctx.drawImage(await load(src), 0, 0, print.offsetWidth, print.offsetHeight);
                    else {
                        ctx.fillStyle = getComputedStyle(print).backgroundColor;
                        ctx.fillRect(0, 0, print.offsetWidth, print.offsetHeight);
                    }
                } catch (e) {}
                ctx.restore();
            }
            for (const svg of trail.querySelectorAll("svg")) {
                try {
                    const clone = svg.cloneNode(true);
                    clone.setAttribute("width", mapW);
                    clone.setAttribute("height", mapH);
                    if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${mapW} ${mapH}`);
                    // The stroke colours live in the stylesheet, which an SVG
                    // drawn as an image cannot reach — so they are copied on
                    // to each shape before it leaves the page.
                    const from = [...svg.querySelectorAll("path, line, polyline, circle")];
                    [...clone.querySelectorAll("path, line, polyline, circle")].forEach((node, i) => {
                        const live = from[i];
                        if (!live) return;
                        const cs = getComputedStyle(live);
                        node.setAttribute("stroke", cs.stroke);
                        node.setAttribute("fill", cs.fill);
                        node.setAttribute("stroke-width", cs.strokeWidth);
                        node.setAttribute("stroke-linecap", cs.strokeLinecap);
                        node.setAttribute("opacity", cs.opacity);
                        node.removeAttribute("class");
                    });
                    const markup = new XMLSerializer().serializeToString(clone);
                    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
                    const img = await load(url);
                    ctx.drawImage(img, 0, 0, mapW, mapH);
                    URL.revokeObjectURL(url);
                } catch (e) {}
            }
            ctx.restore();
        }
        if (onProgress) onProgress(0.8);

        // The names, in the hand the page is lettered in.
        await document.fonts.ready;
        for (const room of canvasEl.querySelectorAll(".wiz-room")) {
            const style = getComputedStyle(room);
            if (Number(style.opacity) < 0.02) continue;
            enterElement(ctx, room);
            ctx.fillStyle = style.color;
            ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (style.textShadow && style.textShadow !== "none") {
                const halo = /rgba?\([^)]+\)/.exec(style.textShadow);
                const blur = /(\d+(?:\.\d+)?)px/g.exec(style.textShadow);
                if (halo) {
                    ctx.shadowColor = halo[0];
                    ctx.shadowBlur = blur ? parseFloat(blur[1]) : 4;
                }
            }
            const lines = room.textContent.trim().split("\n").map(s => s.trim()).filter(Boolean);
            const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.05;
            const top = room.offsetHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
            lines.forEach((line, i) => ctx.fillText(line, room.offsetWidth / 2, top + i * lineHeight));
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        if (onProgress) onProgress(1);
        return { still, mapW, mapH, scale };
    }

    // ---------- the walk between two shots ----------

    /* Zoom is interpolated in log space, and it matters. Stepping the width
       linearly from a whole map to one room spends most of the animation
       creeping across the wide end and then lunges through the last stretch:
       the eye reads zoom as doublings, not as pixels. In log space every
       frame is the same proportional step, which is what "smooth" means
       here.

       Eased at both ends on top of that, so the move starts from rest and
       arrives at rest rather than snapping into motion. */
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    function shotAt(from, to, t) {
        const e = ease(t);
        const w = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * e);
        return {
            cx: from.cx + (to.cx - from.cx) * e,
            cy: from.cy + (to.cy - from.cy) * e,
            w
        };
    }

    /* Makes the GIF. Yields to the browser between frames so the editor
       stays answerable — a hundred frames of nearest-colour matching is
       seconds of work, and a locked page for the whole of it would look like
       a crash. */
    async function record(opts) {
        const { stage, canvas, from, to, width, height, frames, fps, onProgress } = opts;
        // The still is rendered at the widest the animation ever gets, so
        // the closest frame is a crop rather than a magnification.
        const widest = Math.max(from.w, to.w);
        const detail = Math.min(4200, Math.max(width, Math.round(width * (widest / Math.min(from.w, to.w)) * 0.6)));
        const { still, mapW, scale } = await renderStill(stage, canvas, detail,
            p => onProgress && onProgress(p * 0.35, "Drawing the map"));

        const out = document.createElement("canvas");
        out.width = width;
        out.height = height;
        const ctx = out.getContext("2d");
        ctx.imageSmoothingQuality = "high";

        const gif = window.GifEncode.begin(width, height, { delay: Math.round(100 / fps) });
        const shots = [];
        for (let i = 0; i < frames; i++) {
            shots.push(shotAt(from, to, frames === 1 ? 1 : i / (frames - 1)));
        }

        // Two passes over the frames: the colour table has to be known
        // before any frame is written, so the first pass only looks.
        const paint = shot => {
            const sw = shot.w * scale;
            const sh = sw * (height / width);
            ctx.fillStyle = getComputedStyle(document.documentElement)
                .getPropertyValue("--wiz-surround").trim() || "#241a11";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(still,
                shot.cx * scale - sw / 2, shot.cy * scale - sh / 2, sw, sh,
                0, 0, width, height);
            return ctx.getImageData(0, 0, width, height);
        };

        const studied = [];
        for (let i = 0; i < shots.length; i++) {
            const frame = paint(shots[i]);
            // Every fourth frame is enough to learn the colours: consecutive
            // frames of a zoom are the same picture at a slightly different
            // size, and studying all of them costs time for nothing.
            if (i % 4 === 0) gif.study(frame);
            studied.push(frame);
            if (i % 8 === 0) {
                if (onProgress) onProgress(0.35 + 0.25 * (i / shots.length), "Framing");
                await new Promise(r => setTimeout(r));
            }
        }
        for (let i = 0; i < studied.length; i++) {
            gif.write(studied[i]);
            if (i % 4 === 0) {
                if (onProgress) onProgress(0.6 + 0.4 * (i / studied.length), "Encoding");
                await new Promise(r => setTimeout(r));
            }
        }
        if (onProgress) onProgress(1, "Done");
        return gif.finish();
    }

    // ---------- the panel in the editor ----------

    function mount() {
        const panel = document.getElementById("wiz-gif-panel");
        const stage = document.getElementById("wiz-admin-stage");
        const canvas = document.getElementById("wiz-admin-canvas");
        if (!panel || !stage || !canvas) return;

        const $ = id => document.getElementById(id);
        const startOut = $("wiz-gif-start-out");
        const endOut = $("wiz-gif-end-out");
        const status = $("wiz-gif-status");
        const make = $("wiz-gif-make");
        const result = $("wiz-gif-result");
        const preview = $("wiz-gif-preview");
        const save = $("wiz-gif-save");
        const sizeOut = $("wiz-gif-size");
        let from = null;
        let to = null;
        let madeUrl = null;

        const frameCount = () => Math.max(2, Math.round(Number($("wiz-gif-seconds").value || 5) * Number($("wiz-gif-fps").value || 12)));
        const outWidth = () => Math.max(240, Math.min(900, Math.round(Number($("wiz-gif-width").value || 480))));
        const outHeight = () => {
            const box = stage.getBoundingClientRect();
            return Math.round(outWidth() * (box.height / box.width));
        };

        /* Said in the units the person is thinking in — how much of the map
           is in shot — rather than in the pixels it happens to be stored as.
           "A tenth of the map across" is a thing you can picture; "540" is
           not. */
        function describe(shot) {
            const { w: mapW, h: mapH } = mapSize(canvas);
            const share = shot.w / mapW;
            // A percentage rather than "a fifth of the map": the fractions
            // read well down to about a quarter and then start saying "a 7th"
            // and "a 13th", which nobody pictures.
            const across = share >= 0.98 ? "the whole map"
                : share >= 0.45 ? "about half the map"
                : `${Math.round(share * 100)}% of the map across`;
            return `${across}, centred on ${Math.round(shot.cx / mapW * 100)}% / ${Math.round(shot.cy / mapH * 100)}%`;
        }

        function estimate() {
            if (!from || !to) return;
            // Roughly what the encoder gets on this map: a shade over a byte
            // for every five pixels, which is what the frames above measured.
            const bytes = outWidth() * outHeight() * frameCount() * 0.21;
            const mb = bytes / 1048576;
            status.textContent = `${frameCount()} frames, about ${mb < 1 ? Math.round(bytes / 1024) + "KB" : mb.toFixed(1) + "MB"}.`;
            make.disabled = false;
        }

        $("wiz-gif-set-start").addEventListener("click", () => {
            from = currentShot(stage, canvas);
            startOut.textContent = describe(from);
            estimate();
        });

        $("wiz-gif-set-end").addEventListener("click", () => {
            to = currentShot(stage, canvas);
            endOut.textContent = describe(to);
            estimate();
        });

        ["wiz-gif-width", "wiz-gif-seconds", "wiz-gif-fps"].forEach(id => {
            $(id).addEventListener("input", () => { if (from && to) estimate(); });
        });

        make.addEventListener("click", async () => {
            if (!from || !to) return;
            make.disabled = true;
            result.hidden = true;
            try {
                const blob = await record({
                    stage, canvas, from, to,
                    width: outWidth(), height: outHeight(),
                    frames: frameCount(), fps: Number($("wiz-gif-fps").value || 12),
                    onProgress: (p, label) => { status.textContent = `${label}… ${Math.round(p * 100)}%`; }
                });
                if (madeUrl) URL.revokeObjectURL(madeUrl);
                madeUrl = URL.createObjectURL(blob);
                preview.src = madeUrl;
                save.href = madeUrl;
                const kb = blob.size / 1024;
                sizeOut.textContent = kb > 1024 ? (kb / 1024).toFixed(1) + "MB" : Math.round(kb) + "KB";
                result.hidden = false;
                status.textContent = `${frameCount()} frames, made.`;
            } catch (err) {
                status.textContent = "Could not make it — " + (err.message || "try again.");
            }
            make.disabled = false;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount);
    } else {
        mount();
    }

    return { currentShot, renderStill, record, mapSize, mount };
})();

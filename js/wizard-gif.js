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

   Each frame is drawn in its own right, at its own zoom, because the map
   does not look the same at every zoom: rooms and trails have an "appear
   at" of their own, and a GIF that cropped one still a hundred ways could
   only ever show one answer to that. The paper underneath never changes and
   never fades, so that IS drawn once and stamped — it is also the slowest
   part, being two big SVG filters.

   What keeps it quick is throwing work away rather than doing it faster:
   anything outside the frame is skipped before it is drawn, which at the
   close end of a zoom is most of sixteen hundred footprints.

   And it is the map as a VISITOR sees it, not as the editor does. The
   editor shows hidden rooms and out-of-band names as ghosts, because a
   record you cannot find is a record you cannot fix; none of that belongs
   in something being shared.

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

    /* Everything about an element that a frame needs and no frame changes.

       Read once and kept for the length of a recording, because it is the
       whole cost of one: a getComputedStyle is a style resolution, and the
       map has sixteen hundred footprints on it. Asking each of them fifty
       times what colour and shape it is took about a second per frame; the
       positions and sprites cannot change while a GIF is being made, so the
       answer is read once and reused.

       Outside a recording there is no cache and every read is live, which is
       what the preview and any one-off render want. */
    let styleCache = null;

    function infoFor(el) {
        if (styleCache) {
            const hit = styleCache.get(el);
            if (hit) return hit;
        }
        const style = getComputedStyle(el);
        const origin = style.transformOrigin.split(" ").map(parseFloat);
        const info = {
            ox: origin[0] || 0,
            oy: origin[1] || 0,
            left: el.offsetLeft,
            top: el.offsetTop,
            w: el.offsetWidth,
            h: el.offsetHeight,
            opacity: Number(style.opacity) || 1,
            matrix: style.transform && style.transform !== "none"
                ? new DOMMatrixReadOnly(style.transform) : null,
            background: urlIn(style.backgroundImage),
            backgroundColor: style.backgroundColor,
            colour: style.color,
            font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
            lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.05,
            textShadow: style.textShadow,
            filter: style.filter,
            blend: style.mixBlendMode
        };
        if (styleCache) styleCache.set(el, info);
        return info;
    }

    /* Puts the context into an element's own space: its box at (0, 0), its
       transform applied about its own origin, so a rotated footprint or a
       scaled name draws exactly where the page has it. */
    function enterElement(ctx, el, alpha) {
        const info = infoFor(el);
        ctx.save();
        // An explicit alpha wins: it is the band's answer for the frame being
        // drawn, and the element's own opacity is the editor's answer for the
        // zoom the editor is sitting at.
        ctx.globalAlpha *= alpha == null ? info.opacity : alpha;
        ctx.translate(info.left + info.ox, info.top + info.oy);
        if (info.matrix) {
            const m = info.matrix;
            ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        }
        ctx.translate(-info.ox, -info.oy);
        return info;
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

    /* ---------- what a visitor would see ----------

       The editor draws things a visitor never sees, and it has to: a room
       hidden from the map is still a record somebody has to be able to find
       in order to unhide it, and a name that only appears at 3x has to be
       findable at 1x in order to be moved. Both are drawn as ghosts.

       A GIF is not the editor. It is the map as it goes out, so a hidden
       room must not be in it at all, and a name set to appear at 3x must
       appear when the animation passes 3x — which is the whole reason the
       frames below are drawn one at a time rather than cropped out of a
       single still.

       Whether a thing is drawn, and how strongly, is asked of the map's own
       band arithmetic rather than worked out again here. The editor's DOM
       cannot answer it: what its opacity says is what a ghost looks like at
       the zoom the editor happens to be sitting at. */
    let attached = null;

    function attach(view) { attached = view; }

    function recordFor(el) {
        if (!attached) return null;
        const id = el.dataset && el.dataset.id;
        if (!id) return null;
        const kind = el.dataset.kind;
        const list = kind === "room" ? attached.getRooms()
            : kind === "path" ? attached.getPaths()
            : kind === "layer" ? attached.getLayers()
            : null;
        return list ? list.find(r => r.id === id) || null : null;
    }

    /* How strongly this element is drawn in a frame at the given zoom, or 0
       for one a visitor would never see at all. Without a view attached
       nothing is filtered and the page's own opacity stands, which is what
       the public map's DOM already means. */
    function publicAlpha(el, atZoom) {
        const record = recordFor(el);
        if (!record) return Number(getComputedStyle(el).opacity) || 1;
        if (record.hidden) return 0;
        const band = attached.bandOpacityAt ? attached.bandOpacityAt(record, atZoom) : 1;
        const own = record.opacity == null ? 1 : Number(record.opacity);
        return band * own;
    }

    // The zoom the map would be at with this much of it across the stage —
    // the number the bands are written in terms of.
    function zoomForShot(stageEl, shot) {
        if (!attached || !attached.getFit) return null;
        const fit = attached.getFit();
        const stageWidth = stageEl.getBoundingClientRect().width;
        if (!fit || !stageWidth || !shot.w) return null;
        return stageWidth / (fit * shot.w);
    }

    // ---------- the still ----------

    /* The paper on its own, drawn once and kept.

       It is the one part of the map that never changes between frames — no
       zoom band touches it and nothing can hide it — and it is also the
       slowest part, because the two stains are big SVG filters the browser
       has to rasterise. Drawn per frame it dominated everything; drawn once
       and stamped, it costs a single drawImage. */
    let paperKeep = null;

    async function paperStill(canvasEl, width) {
        const { w: mapW, h: mapH } = mapSize(canvasEl);
        if (paperKeep && paperKeep.width === Math.round(width)) return paperKeep;
        const sheet = document.createElement("canvas");
        sheet.width = Math.round(width);
        sheet.height = Math.round(mapH * (width / mapW));
        const ctx = sheet.getContext("2d");
        ctx.scale(width / mapW, width / mapW);
        await drawPaper(ctx, mapW, mapH, canvasEl.querySelector(".wiz-paper"));
        paperKeep = sheet;
        return sheet;
    }

    /* Draws the map, in map coordinates, either whole or through a window.

       With a `shot` it draws that rectangle of the map into a canvas of the
       given size — one frame of the animation. Without one it draws the
       whole sheet, which is what the preview and any debugging want. Either
       way the body below is the same code working in map pixels, because
       the only difference between the two is the transform set up here.

       `clip` is that rectangle in map pixels, and everything outside it is
       skipped. It matters most exactly where the work is heaviest: at the
       close end of a zoom there are sixteen hundred footprints on the sheet
       and perhaps forty of them in shot. */
    async function renderStill(stageEl, canvasEl, opts) {
        const { w: mapW, h: mapH } = mapSize(canvasEl);
        const shot = opts.shot;
        const onProgress = opts.onProgress;
        const atZoom = opts.atZoom;
        const width = opts.width;
        const still = opts.target || document.createElement("canvas");
        let scale;
        let clip;

        if (shot) {
            still.width = Math.round(width);
            still.height = Math.round(opts.height);
            scale = width / shot.w;
            const shotH = shot.w * (opts.height / width);
            clip = { x0: shot.cx - shot.w / 2, y0: shot.cy - shotH / 2, x1: shot.cx + shot.w / 2, y1: shot.cy + shotH / 2 };
        } else {
            scale = width / mapW;
            still.width = Math.round(width);
            still.height = Math.round(mapH * scale);
            clip = { x0: 0, y0: 0, x1: mapW, y1: mapH };
        }

        const ctx = still.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, still.width, still.height);
        ctx.imageSmoothingQuality = "high";
        // The table showing where the sheet does not reach, as on the page.
        ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue("--wiz-surround").trim() || "#241a11";
        ctx.fillRect(0, 0, still.width, still.height);
        ctx.setTransform(scale, 0, 0, scale, -clip.x0 * scale, -clip.y0 * scale);

        /* What the frame ended up containing. Returned rather than kept
           private because "did the hidden rooms stay out of it" is a
           question worth being able to ask of a real frame rather than of
           the code that draws one. */
        const drew = { rooms: 0, trails: 0, layers: 0, skippedHidden: 0, skippedBand: 0, skippedOffscreen: 0 };

        const inShot = (x, y, w, h) =>
            x + w >= clip.x0 && x <= clip.x1 && y + h >= clip.y0 && y <= clip.y1;

        ctx.drawImage(await paperStill(canvasEl, opts.paperWidth || 1600), 0, 0, mapW, mapH);
        if (onProgress) onProgress(0.15);

        // An uploaded background, if this map has one, sits on the paper.
        for (const bg of canvasEl.querySelectorAll("img.wiz-bg")) {
            try { ctx.drawImage(await load(bg.currentSrc || bg.src), 0, 0, mapW, mapH); } catch (e) {}
        }

        // The pictures, each with its own turn, flip and fading.
        for (const layer of canvasEl.querySelectorAll("img.wiz-layer")) {
            const alpha = publicAlpha(layer, atZoom);
            if (alpha < 0.02) { if (recordFor(layer) && recordFor(layer).hidden) drew.skippedHidden++; else drew.skippedBand++; }
            if (alpha < 0.02) continue;
            if (!inShot(layer.offsetLeft - layer.offsetWidth, layer.offsetTop - layer.offsetHeight,
                layer.offsetWidth * 2, layer.offsetHeight * 2)) continue;
            try {
                const img = await load(layer.currentSrc || layer.src);
                enterElement(ctx, layer, alpha);
                drew.layers++;
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
            const alpha = publicAlpha(trail, atZoom);
            if (alpha < 0.02) { if (recordFor(trail) && recordFor(trail).hidden) drew.skippedHidden++; else drew.skippedBand++; }
            if (alpha < 0.02) continue;
            enterElement(ctx, trail, alpha);
            drew.trails++;
            for (const print of trail.querySelectorAll(".wiz-print")) {
                const step = infoFor(print);
                // The margin is the print itself: it is drawn about its own
                // centre and rotated, so its box can reach a little past
                // where offsetLeft says it starts.
                if (!inShot(step.left - step.w, step.top - step.h, step.w * 3, step.h * 3)) {
                    drew.skippedOffscreen++;
                    continue;
                }
                enterElement(ctx, print);
                try {
                    if (step.background) ctx.drawImage(await load(step.background), 0, 0, step.w, step.h);
                    else {
                        ctx.fillStyle = step.backgroundColor;
                        ctx.fillRect(0, 0, step.w, step.h);
                    }
                } catch (e) {}
                ctx.restore();
            }
            for (const svg of trail.querySelectorAll("svg")) {
                try {
                    /* Kept once a recording has asked for it. Serialising an
                       SVG, making a blob and waiting for the browser to
                       decode it is a real cost, and doing it again for every
                       frame of an animation that draws the same eleven pen
                       strokes fifty times is the same picture fifty times. */
                    const kept = styleCache && styleCache.get(svg);
                    if (kept) {
                        ctx.drawImage(kept, 0, 0, mapW, mapH);
                        continue;
                    }
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
                    // Held against the element itself while a recording is
                    // running, and let go with the cache when it ends. The
                    // blob URL has to outlive the image, so it is not revoked
                    // until then either.
                    if (styleCache) styleCache.set(svg, img);
                    else URL.revokeObjectURL(url);
                } catch (e) {}
            }
            ctx.restore();
        }
        if (onProgress) onProgress(0.8);

        // The names, in the hand the page is lettered in.
        await document.fonts.ready;
        for (const room of canvasEl.querySelectorAll(".wiz-room")) {
            const name = infoFor(room);
            const alpha = publicAlpha(room, atZoom);
            if (alpha < 0.02) { if (recordFor(room) && recordFor(room).hidden) drew.skippedHidden++; else drew.skippedBand++; }
            if (alpha < 0.02) continue;
            // Names are scaled about their middle, so allow for the biggest
            // of them reaching well past its own box.
            if (!inShot(name.left - name.w * 3, name.top - name.h * 3, name.w * 7, name.h * 7)) {
                drew.skippedOffscreen++;
                continue;
            }
            enterElement(ctx, room, alpha);
            drew.rooms++;
            ctx.fillStyle = name.colour;
            ctx.font = name.font;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (name.textShadow && name.textShadow !== "none") {
                const halo = /rgba?\([^)]+\)/.exec(name.textShadow);
                const blur = /(\d+(?:\.\d+)?)px/g.exec(name.textShadow);
                if (halo) {
                    ctx.shadowColor = halo[0];
                    ctx.shadowBlur = blur ? parseFloat(blur[1]) : 4;
                }
            }
            const lines = room.textContent.trim().split("\n").map(s => s.trim()).filter(Boolean);
            const top = name.h / 2 - ((lines.length - 1) * name.lineHeight) / 2;
            lines.forEach((line, i) => ctx.fillText(line, name.w / 2, top + i * name.lineHeight));
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        if (onProgress) onProgress(1);
        return { still, mapW, mapH, scale, drew };
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

        const shots = [];
        for (let i = 0; i < frames; i++) {
            shots.push(shotAt(from, to, frames === 1 ? 1 : i / (frames - 1)));
        }

        /* The paper is drawn once and every frame stamps it, but everything
           on top of it is drawn per frame, and that is not an optimisation
           lost — it is the point. A name set to appear at 3x has to appear
           when the animation passes 3x, and a single still cropped a hundred
           ways can only ever show one answer to that question. */
        await paperStill(canvas, 1600);

        /* Nothing on the map moves while a GIF is being made, so every
           element is measured once and the answers kept for the whole run.
           Without this each frame asked sixteen hundred footprints what
           shape and colour they were, which is a style resolution apiece and
           took about a second a frame. */
        styleCache = new Map();

        const out = document.createElement("canvas");
        const gif = window.GifEncode.begin(width, height, { delay: Math.round(100 / fps) });
        const done = [];

        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i];
            const atZoom = zoomForShot(stage, shot);
            await renderStill(stage, canvas, { shot, width, height, atZoom, target: out });
            const frame = out.getContext("2d").getImageData(0, 0, width, height);
            /* Every fourth frame is enough to learn the colours: consecutive
               frames of a zoom are the same drawing at a slightly different
               size. The first and last are always studied, because those two
               are where a colour that appears nowhere else — the far end of a
               fade — is most likely to live. */
            if (i % 4 === 0 || i === shots.length - 1) gif.study(frame);
            done.push(frame);
            if (onProgress) onProgress(0.7 * ((i + 1) / shots.length), "Drawing frame " + (i + 1));
            await new Promise(r => setTimeout(r));
        }

        for (let i = 0; i < done.length; i++) {
            gif.write(done[i]);
            if (i % 4 === 0) {
                if (onProgress) onProgress(0.7 + 0.3 * (i / done.length), "Encoding");
                await new Promise(r => setTimeout(r));
            }
        }
        if (onProgress) onProgress(1, "Done");
        // Let the measurements go: the next recording may be of a map that
        // has been edited since, and a stale box is a footprint drawn where
        // it used to be.
        styleCache = null;
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
            /* Measured on this map rather than guessed: a 480x409 GIF of 48
               frames came out at 1.4MB, which is about a byte for every six
               pixels. It is an estimate and says so — a run that spends
               longer on the close, busy end of the map will beat it, and one
               held on empty parchment will come in under. */
            const bytes = outWidth() * outHeight() * frameCount() * 0.16;
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

    return { currentShot, renderStill, record, mapSize, mount, attach };
})();

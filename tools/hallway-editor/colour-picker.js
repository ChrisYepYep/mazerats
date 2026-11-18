/* The editor's one colour picker: a floating panel with a saturation square, a hue strip, hex and RGB boxes, the colour you
   started from, your recent colours, and the screen's eyedropper. Every change applies at once, and it stays open until you
   press Done or Cancel (or Escape, which is Done), so you can try colours against the map. Drag it by its title.
   ColourPicker.open({ title, value, onChange(hex), onCancel(), onDone() })   ColourPicker.close()   ColourPicker.isOpen() */
"use strict";
(function () {
    const RECENT_KEY = "hallway-recent-colours", clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const PRESETS = ["#7a2230", "#a8452f", "#b7793a", "#c9a24b", "#6f7d3c", "#3f7a5a", "#2f7f85", "#355c8a", "#4f4a8c", "#7d4a86", "#a8567f", "#8a6f5a", "#5a3a26", "#2e2b33", "#8d8a86", "#e6dcc8"];
    const toHex = rgb => "#" + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
    const fromHex = h => { let s = String(h || "").trim().replace(/^#/, ""); if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, "$&$&"); return /^[0-9a-f]{6}$/i.test(s) ? [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) : null; };
    const hsvToRgb = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; }; return [f(5), f(3), f(1)]; };
    const rgbToHsv = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx ? d / mx : 0, mx]; };
    const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } };
    const remember = hex => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...recent().filter(c => c !== hex)].slice(0, 8))); } catch (e) { /* nothing to lose */ } };

    let panel = null, current = null;
    const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    /* follow a drag anywhere on screen, starting from the press */
    const dragging = (node, fn) => node.addEventListener("pointerdown", e => {
        /* a button inside it (the title's ×) gets its own click: capturing the pointer here sent the click to the title bar instead (18 Nov scan) */
        if (e.target !== node && e.target.closest && e.target.closest("button")) return;
        e.preventDefault(); e.stopPropagation(); node.setPointerCapture && node.setPointerCapture(e.pointerId); fn(e);
        const mv = q => fn(q), up = () => { node.removeEventListener("pointermove", mv); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up); };
        node.addEventListener("pointermove", mv); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
    });

    function build() {
        panel = el("div", "cpk"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Colour picker"); panel.hidden = true;
        const head = el("div", "cpk-head", panel), title = el("strong", "", head); panel._title = title;
        const x = el("button", "cpk-x", head, "×"); x.type = "button"; x.setAttribute("aria-label", "Done"); x.addEventListener("click", () => close(true));
        dragging(head, (() => { let ox = 0, oy = 0, started = false; return e => { if (e.type === "pointerdown") { const r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; started = true; return; } if (!started) return; panel.style.left = clamp(e.clientX - ox, 0, innerWidth - panel.offsetWidth) + "px"; panel.style.top = clamp(e.clientY - oy, 0, innerHeight - 40) + "px"; }; })());
        const sv = el("div", "cpk-sv", panel), svDot = el("i", "", sv), hue = el("div", "cpk-hue", panel), hueDot = el("i", "", hue);
        const row = el("div", "cpk-row", panel), was = el("button", "cpk-was", row); was.type = "button"; was.title = "Back to the colour you started with"; const now = el("span", "cpk-now", was), old = el("span", "cpk-old", was);
        const box = (label, cls) => { const f = el("label", "cpk-f " + cls, row); el("span", "", f, label); const i = el("input", "", f); i.type = "text"; i.spellcheck = false; i.autocomplete = "off"; return i; };
        const hex = box("Hex", "hex"), r = box("R", "n"), g = box("G", "n"), b = box("B", "n");
        const swLabel = el("div", "cpk-sub", panel, "Recent"), recents = el("div", "cpk-sw", panel), presets = (el("div", "cpk-sub", panel, "Palette"), el("div", "cpk-sw", panel));
        const foot = el("div", "cpk-foot", panel), drop = el("button", "btn small", foot, "Eyedropper"); drop.type = "button"; drop.hidden = !window.EyeDropper;
        const cancel = el("button", "btn small ghost", foot, "Cancel"); cancel.type = "button"; const done = el("button", "btn small primary", foot, "Done"); done.type = "button";
        panel.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape" || (e.key === "Enter" && e.target.tagName === "INPUT")) { e.preventDefault(); close(true); } });
        panel.addEventListener("keyup", e => e.stopPropagation());

        const sync = from => {
            const c = current; if (!c) return;
            const rgb = hsvToRgb(c.h, c.s, c.v), code = toHex(rgb);
            sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${c.h},100%,50%))`;
            svDot.style.left = c.s * 100 + "%"; svDot.style.top = (1 - c.v) * 100 + "%"; svDot.style.background = code;
            hueDot.style.left = c.h / 360 * 100 + "%"; hueDot.style.background = `hsl(${c.h},100%,50%)`;
            now.style.background = code;
            if (from !== "hex") hex.value = code; if (from !== "rgb") { r.value = Math.round(rgb[0]); g.value = Math.round(rgb[1]); b.value = Math.round(rgb[2]); }
            if (from !== "open" && code !== c.last) { c.last = code; c.touched = true; c.onChange && c.onChange(code); }
        };
        const setHex = (code, from) => { const q = fromHex(code); if (!q || !current) return false; const [h, s, v] = rgbToHsv(q); current.s = s; current.v = v; if (s > 0 && v > 0) current.h = h; sync(from); return true; };
        panel._setHex = setHex;
        dragging(sv, e => { const q = sv.getBoundingClientRect(); current.s = clamp((e.clientX - q.left) / q.width, 0, 1); current.v = 1 - clamp((e.clientY - q.top) / q.height, 0, 1); sync(); });
        dragging(hue, e => { const q = hue.getBoundingClientRect(); current.h = clamp((e.clientX - q.left) / q.width, 0, 1) * 359.9; sync(); });
        hex.addEventListener("input", () => setHex(hex.value, "hex"));
        hex.addEventListener("blur", () => { if (current) hex.value = current.last || hex.value; });
        for (const i of [r, g, b]) i.addEventListener("input", () => { const q = [r, g, b].map(n => Number(n.value)); if (q.every(v => Number.isFinite(v) && v >= 0 && v <= 255)) setHex(toHex(q), "rgb"); });
        was.addEventListener("click", () => { if (current) setHex(current.start); });
        const swatches = (box2, list) => { box2.textContent = ""; for (const c of list) { const s = el("button", "cpk-swatch", box2); s.type = "button"; s.style.background = c; s.title = c; s.setAttribute("aria-label", c); s.addEventListener("click", () => setHex(c)); } };
        swatches(presets, PRESETS);
        panel._fresh = () => { const list = recent(); swatches(recents, list); swLabel.hidden = recents.hidden = !list.length; };
        panel._old = old;
        drop.addEventListener("click", async () => { try { const got = await new window.EyeDropper().open(); setHex(got.sRGBHex); } catch (e) { /* they changed their mind */ } });
        cancel.addEventListener("click", () => close(false)); done.addEventListener("click", () => close(true));
        document.body.appendChild(panel);
    }
    function open(o) {
        if (current) close(true);
        if (!panel) build();
        const q = fromHex(o.value) || [176, 106, 80], start = toHex(q), [h, s, v] = rgbToHsv(q);
        current = { ...o, h, s, v, start, last: start, touched: false, had: !!fromHex(o.value) };
        panel._title.textContent = o.title || "Colour"; panel._old.style.background = start; panel._fresh(); panel.hidden = false;
        panel._setHex(start, "open");
        /* beside the panel on the right, unless it has been dragged somewhere already */
        if (!panel.style.left) { panel.style.left = Math.max(8, innerWidth - 640) + "px"; panel.style.top = "90px"; }
    }
    function close(keep) {
        if (!current) return;
        const c = current; current = null; panel.hidden = true;
        if (keep) { if (c.touched) remember(c.last); c.onDone && c.onDone(c.last); } else if (c.touched) c.onCancel && c.onCancel();
    }
    window.ColourPicker = { open, close, isOpen: () => !!current };
})();

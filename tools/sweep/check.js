/* The checks run inside a page, after each view is opened (tools/sweep.js).
   Read as text and evaluated as the body of a function, so it ends with a
   `return`; ARGS is given by the caller. Nothing here changes the page except
   the data-sweep-c numbers on the texts the pixel contrast check measures.

   What it answers:
     scrollW / W     the page wider than the window (sideways scrolling), and
                     the elements that stick out past the right edge;
     clipped         text cut off by a box too small for it (not an ellipsis);
     texts           every text you can see, numbered, with its own colour,
                     for sweep.js to measure against the pixels behind it;
     selects         each drop-down's closed text against its box, and its
                     options against the list they open in;
     noAlt           pictures with no alt at all;
     unlabelled      buttons, links and fields with no name a screen reader
                     could say. */
const W = innerWidth, H = innerHeight;
const de = document.documentElement;
const out = {
    theme: de.getAttribute("data-theme"), skin: de.getAttribute("data-skin"),
    dark: de.hasAttribute("data-dark"), light: de.hasAttribute("data-light"),
    scrollW: Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0), W
};
const shown = el => { for (let e = el; e && e !== de; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false; } return true; };
const sel = el => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
        let s = e.tagName.toLowerCase();
        if (e.id) { s += "#" + e.id; parts.unshift(s); break; }
        if (e.classList.length) s += "." + [...e.classList].slice(0, 2).join(".");
        parts.unshift(s);
    }
    return parts.join(">");
};
const clippedBy = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (/(hidden|clip|auto|scroll)/.test(cs.overflowX)) return e; } return null; };

// Sideways scrolling, and what sticks out.
out.wide = [];
if (out.scrollW > W + 1) {
    for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > W + 1 && r.width > 0 && shown(el) && !clippedBy(el)) { out.wide.push(sel(el) + " right edge " + Math.round(r.right)); if (out.wide.length > 6) break; }
    }
}

// Text cut off, and every text on screen for the contrast check.
const clipped = [];
const textEls = [];
for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "svg", "OPTION", "SELECT", "TEXTAREA"].includes(el.tagName)) continue;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.trim();
    if (!own || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    textEls.push([el, own, r]);
    const cs = getComputedStyle(el);
    if (/(hidden|clip)/.test(cs.overflowX + cs.overflowY) && cs.textOverflow !== "ellipsis" && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 3)
        && !/sr-only|visually-hidden|mw-sr/.test(el.className))
        clipped.push(sel(el) + " '" + own.slice(0, 30) + "'");
}
out.clipped = clipped.slice(0, 10);

const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratioOf = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
const groundOf = el => {
    for (let e = el; e; e = e.parentElement) {
        const b = parse(getComputedStyle(e).backgroundColor);
        if (b && b.a > 0.5) return b;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
};

/* The texts for the pixel check: only what is on top where it sits (a text
   under an open window's backdrop is not what anyone reads), and not
   switched-off controls, which WCAG leaves out of contrast. */
document.querySelectorAll("[data-sweep-c]").forEach(e => e.removeAttribute("data-sweep-c"));
/* The part of a box that can be seen: cut to every scrolling or clipping box
   round it, and to the window. A text half scrolled out of its list would
   otherwise be measured against whatever lies past the list's edge. */
const seenPart = (el, r) => {
    let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
    for (let e = el.parentElement; e && e !== de; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const b = e.getBoundingClientRect();
        x0 = Math.max(x0, b.left); y0 = Math.max(y0, b.top); x1 = Math.min(x1, b.right); y1 = Math.min(y1, b.bottom);
    }
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
};
const texts = [];
for (const [el, own, r] of textEls) {
    if (texts.length >= 400) break;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.3) continue;
    if (el.closest("[disabled], [aria-disabled='true'], .is-disabled")) continue;
    const box = seenPart(el, r);
    if (!box || box[2] * box[3] < 0.6 * r.width * r.height) continue;
    const cx = box[0] + box[2] / 2, cy = box[1] + Math.min(box[3], 40) / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
    el.setAttribute("data-sweep-c", texts.length);
    const shadow = cs.textShadow && cs.textShadow !== "none";
    texts.push({ sel: sel(el), text: own.slice(0, 24), fg: [fg.r, fg.g, fg.b], size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400, box, shadow });
}
out.texts = texts;

/* Drop-downs: the closed box, and the first options as their list paints
   them. A closed box with a background of its own is measured here; one
   that is see-through goes to the pixel check with the texts, since what is
   behind it may be a picture or a gradient the styles can't say. */
out.selects = [...document.querySelectorAll("select")].filter(shown).map(s => {
    const cs = getComputedStyle(s);
    const fg = parse(cs.color);
    const own = parse(cs.backgroundColor);
    const opaque = own && own.a > 0.5;
    const r = s.getBoundingClientRect();
    if (!opaque && fg && texts.length < 400) {
        const box = seenPart(s, r);
        if (box && box[2] * box[3] >= 0.6 * r.width * r.height) {
            s.setAttribute("data-sweep-c", texts.length);
            const o = s.options[s.selectedIndex];
            texts.push({ sel: sel(s), text: (o ? o.text : "").trim().slice(0, 24) || "(drop-down)", fg: [fg.r, fg.g, fg.b], size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400, box, shadow: false });
        }
    }
    const bg = opaque ? own : null;
    let worstOpt = null;
    for (const o of [...s.options].slice(0, 4)) {
        const oc = getComputedStyle(o);
        const of = parse(oc.color), ob = parse(oc.backgroundColor);
        if (!of) continue;
        const r = ratioOf(of, ob && ob.a > 0.5 ? ob : (own && own.a > 0.5 ? own : { r: 255, g: 255, b: 255 }));
        if (!worstOpt || r < worstOpt.r) worstOpt = { r, line: oc.color + " on " + oc.backgroundColor };
    }
    return { sel: sel(s), closed: fg && bg ? +ratioOf(fg, bg).toFixed(2) : null, colours: cs.color + " on " + cs.backgroundColor, opt: worstOpt ? +worstOpt.r.toFixed(2) : null, optColours: worstOpt ? worstOpt.line : "" };
});

// Pictures on show with no alt (an empty alt is a deliberate "decorative", and fine).
out.noAlt = [...document.querySelectorAll("img:not([alt])")].filter(shown).map(i => sel(i) + " " + (i.getAttribute("src") || "").slice(-40)).slice(0, 12);

// Controls with no name.
out.unlabelled = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")].filter(e => shown(e) && !e.closest("[aria-hidden=true], [inert]")
    && !(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.textContent.trim() || e.title || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`))
        || e.closest("label") || (e.querySelector && e.querySelector("img[alt]:not([alt=''])")) || e.placeholder || e.type === "submit")).map(sel).slice(0, 10);
return out;

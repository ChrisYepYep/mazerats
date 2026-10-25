/* The Halloween skin's console tabs, in costume (css/skin-halloween.css).

   Witching Hour's tab art (assets/img/witch/console), muted, with its icon
   redrawn. The skin wears this console on every palette (the owner's, 25
   Oct 2026: the console purple whatever the site is wearing), so it is the
   one set made (the classic art is read only to find the faces' skin). The
   icons: Profile a gravestone in slime, Contact a green-skinned witch, Source a
   zombie pair, and an eye looking back through Privacy's glass. The
   costumes are drawn in the icons' own idiom: the same dark outline, flat
   fills, and a one-pixel shadow in that palette's own darker tone.

   Witching Hour's set is MUTED (the owner's, 25 Oct 2026: "let's go for
   the purple but slightly more muted"): its purples lose MUTE of their
   saturation, and the costumes keep theirs. MUTE is the same factor the
   stylesheet puts on the rest of that console, so tabs and frame match.

   usage: node tools/skin-halloween-tabs.js
     writes assets/img/skin-halloween/console/witch/: the eight tabs, and the
     muted frame border, top pattern and close box */
const fs = require("fs");
const path = require("path");
const { decodePng, encodePng, rgbToHsl, hslToRgb } = require("./theme-png.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets/img/skin-halloween/console");
const MUTE = 0.62;
const X0 = 12, Y0 = 8;                  // the icon area, 26x20, in every tab

const THEMES = { classic: "assets/img/console", purple: "assets/img/purple/console", pumpkin: "assets/img/pumpkin/console",
    witch: "assets/img/witch/console", crimson: "assets/img/crimson/console" };

const PAL = {
    b: [51, 0, 0],
    g: [150, 214, 84], G: [92, 160, 48], l: [200, 246, 140],
    p: [96, 52, 140], P: [62, 30, 96], q: [140, 92, 190],
    o: [244, 140, 28],
    w: [214, 210, 222], W: [150, 144, 166],
    e: [252, 252, 252], r: [90, 200, 40], x: [20, 0, 0], R: [222, 52, 52],
    z: [168, 196, 140], Z: [112, 146, 96]
};
// '.' leaves the tab's own pixel; 'a' is the tab's fill; 's' its shadow tone.
const ICONS = {
    profile: [
        "..........................",
        "..........................",
        "aaaaaaabbbbbbaaaaaaaaaaaaa",
        "aaaaabbwwwwwwbbaaaaaaaaaaa",
        "aaaabwwwwbbwwwWbaaaaaaaaaa",
        "aaaabwwwbbbbwwWbsaaaaaaaaa",
        "aaaabwwwwbbwwwWbsaaaaaaaaa",
        "aaaabwwwwbbwwwWbsaaaaaaaaa",
        "aaaabwwwwbbwwwWbsaaaaaaaaa",
        "aaaabwwwwbbwwwWbsaaaaaaaaa",
        "aaaabwwwwwwwwWWbsaaaaaaaaa",
        "aaablgggGgggggGgbsaaaaaaaa",
        "aaabbbbbbbbbbbbbbsaaaaaaaa",
        "aaaassssssssssssssaaaaaaaa"],
    contact: [
        "aaaaaaaaaaaaaaabbaaaaaaaaa",
        "aaaaaaaaaaaaabbqbaaaaaaaaa",
        "aaaaaaaaaaabbqpPbaaaaaaaaa",
        "aaaaaaaaabbqppPbsaaaaaaaaa",
        "aaaaaaaabqpppPPbsaaaaaaaaa",
        "aaaaaaabooooooobsaaaaaaaaa",
        "aaabbbbbqpppppPbbbbbaaaaaa",
        "aabqqqqpppppppppppPPbaaaaa",
        "aaabbbbbbggggggbbbbbbsaaaa",
        "aaaaabbglgggggGGbbsaaaaaaa",
        "aaaaabbggbgggbgGbbsaaaaaaa",
        "aaaaaabgggggGggGbsaaaaaaaa",
        "aaaaaabggggggGggbsaaaaaaaa",
        "aaaaaaabgbbbggGbsaaaaaaaaa",
        "aaaaaaaabgggggbsaaaaaaaaaa",
        "aaaaaaaaabbbbbsaaaaaaaaaaa"],
    privacy: [
        "..........................",
        "..........................",
        "..........................",
        "..........................",
        "..........eeee............",
        "..........errre...........",
        "..........erxre...........",
        "..........errre...........",
        "..........eeee............"]
};

const muteRgb = (rgb) => { const [h, s, l] = rgbToHsl(...rgb); return (h >= 240 && h <= 310) ? hslToRgb(h, s * MUTE, l).map(Math.round) : rgb; };
const read = (dir, name, state) => decodePng(fs.readFileSync(path.join(ROOT, dir, `cnsl-tab-site-${name}-${state}.png`)));
const pix = (p, x, y) => { const k = (y * p.width + x) * 4; return [p.data[k], p.data[k + 1], p.data[k + 2]]; };
const setPix = (p, x, y, rgb) => { const k = (y * p.width + x) * 4; p.data[k] = rgb[0]; p.data[k + 1] = rgb[1]; p.data[k + 2] = rgb[2]; p.data[k + 3] = 255; };

// Where the source pair's skin is, read off the classic art once: every theme's art is that art recoloured.
const classicPeople = read(THEMES.classic, "people", "inactive");
const SKIN = [], SKIN_SHADE = [];
for (let y = 0; y < classicPeople.height; y++) for (let x = 0; x < classicPeople.width; x++) {
    const c = pix(classicPeople, x, y).join(",");
    if (c === "255,198,123") SKIN.push([x, y]); else if (c === "214,156,74") SKIN_SHADE.push([x, y]);
}

let n = 0;
for (const [theme, dir] of Object.entries(THEMES).filter(([t]) => t === "witch")) {
    const muted = theme === "witch";
    fs.mkdirSync(path.join(OUT, theme), { recursive: true });
    // The palette's own shadow tone: the contact tab's, under the face.
    const sh = pix(read(dir, "contact", "inactive"), X0 + 18, Y0 + 9);
    const shadow = muted ? muteRgb(sh) : sh;
    for (const name of ["profile", "contact", "people", "privacy"]) {
        for (const state of ["inactive", "active"]) {
            const p = read(dir, name, state);
            if (muted) for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) setPix(p, x, y, muteRgb(pix(p, x, y)));
            const fill = pix(p, X0 + 25, Y0 + 19);
            const grid = ICONS[name];
            if (grid) grid.forEach((row, y) => [...row].forEach((c, x) => {
                if (c === ".") return;
                setPix(p, X0 + x, Y0 + y, c === "a" ? fill : c === "s" ? shadow : PAL[c]);
            }));
            if (name === "people") {
                SKIN.forEach(([x, y]) => setPix(p, x, y, PAL.z));
                SKIN_SHADE.forEach(([x, y]) => setPix(p, x, y, PAL.Z));
                setPix(p, X0 + 11, Y0 + 7, PAL.R);      // one red eye
            }
            fs.writeFileSync(path.join(OUT, theme, `cnsl-tab-site-${name}-${state}.png`), encodePng(p.width, p.height, Buffer.from(p.data)));
            n++;
        }
    }
}
/* The rest of Witching Hour's console art, muted by the same function, so
   frame, border, grip, close box and tabs are all the one purple. A CSS
   saturate() filter does NOT match this (it works on the channels, not on
   HSL saturation), and showed as a dark ring between the border art and the
   frame's fill: the reason these are files. */
for (const file of ["cnsl-frame-border.png", "cnsl-top-pattern.png", "cnsl-top-x-close.png"]) {
    const p = decodePng(fs.readFileSync(path.join(ROOT, THEMES.witch, file)));
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3]) setPix(p, x, y, muteRgb(pix(p, x, y)));
    fs.writeFileSync(path.join(OUT, "witch", file), encodePng(p.width, p.height, Buffer.from(p.data)));
    n++;
}
// The two flat colours the stylesheet needs, worked out the same way.
const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
console.log("wrote", n, "files; muted fill", hex(muteRgb([0x71, 0x2c, 0xa6])), "title", hex(muteRgb([0x2c, 0x0c, 0x45])));

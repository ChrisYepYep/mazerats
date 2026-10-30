/* Builds every alternative palette: recoloured chrome art and a stylesheet
   per theme, each overriding the browns the site is normally painted in.

   Run it after changing any colour in css/style.css, or any of the pixel art
   it recolours. All themes, or one by name:

       node tools/themes.js
       node tools/themes.js pumpkin

   For each theme it writes two things and nothing else:

       assets/img/<theme>/...       recoloured copies of the 47 brown assets
       css/theme-<theme>.css        the override stylesheet

   ----------------------------------------------------------------------
   WHY IT IS GENERATED RATHER THAN WRITTEN

   The site's colours are only three-quarters in variables: 721 rules use
   var(), but 169 more carry a brown hex or rgba of their own, spread over 72
   distinct values. Hand-converting those into variables would mean editing
   169 live declarations — in a 13,000-line stylesheet whose narrow-layout
   block at the end deliberately restates earlier rules — to add a theme
   nobody may even switch on. Every one of those edits is a chance to change
   the look the site has today.

   Generating instead means the existing rules are NEVER TOUCHED. The classic
   palette cannot regress, because nothing about it changed; the purple theme
   are additive and inert until <html data-theme="..."> names one of them.

   ----------------------------------------------------------------------
   ONE TRANSFORM, TWO OUTPUTS

   The frame art and the CSS fill behind it have to be the same purple, or
   the window surround sits on a panel of a slightly different colour and the
   whole thing looks broken. So `toPurple` below is used for BOTH — the PNG
   pixels and the CSS values go through the same function, and cannot drift.

   HUE IS REPLACED, NOT ROTATED. Every brown here sits between 12 and 55
   degrees; rotating would preserve that 43-degree spread, which on the
   purple side reads as a wash of unrelated violets, pinks and blues.
   Replacing it with a hue chosen by LIGHTNESS — surfaces take one, lit
   colours take another, see THEMES below — keeps the artwork readable: a
   highlight stays lighter than its fill by exactly the proportion it was,
   and gains a colour of its own for being the lit part.

   Saturation is lifted slightly. Brown at 25% saturation is a warm neutral
   the eye reads as a colour; violet at 25% is simply grey, and the site came
   out looking like a monitor with a dead channel. The lift is what makes it
   read as PURPLE rather than as desaturated.

   ACHROMATIC PIXELS AND COLOURS ARE LEFT ALONE. Black outlines, white text,
   the greys — all pass through untouched. Forcing a hue onto them would tint
   every outline in the pixel art and every neutral on the page. */
const fs = require("fs");
const path = require("path");
const { decodePng, encodePng, rgbToHsl, hslToRgb } = require("./theme-png.js");

const ROOT = path.resolve(__dirname, "..");

/* THE PALETTES.

   Everything below this line is one transform; a theme is just the numbers it
   is handed. Adding one means adding a row here, a name to VALID_THEMES in
   netlify/functions/settings.js, and a button in warren.html — no new code.

     surfaceHue  the hue the DARK end becomes: the page, the window surround,
                 the rows, the frame art's fills
     accentHue   the hue the LIGHT end becomes: text, highlights, the lit
                 edges of the pixel art. Set it equal to surfaceHue for a
                 single-hue palette.
     sat/satMax  how much the dark end (surfaces) is saturated
     fadeSat     how much the light end (text) is DESATURATED — see the two
                 zones note below. NOT the same number for every hue: violet
                 at 27% saturation still reads as lavender, but orange at 27%
                 reads as skin and green as sage. The warm hues and the green
                 need far more of it left in to be the colour they claim.
     gamma       how hard the dark end is pushed down
     keep        how much of the dark end is darkened by a straight SCALE
                 rather than by that gamma — which is what keeps the page,
                 the window, the panel and the row at five distinguishable
                 depths instead of one near-black. See the note on mapLight.
     bone        how far the very light end — the text and the buttons — is
                 pulled back towards neutral. See the third-zone note.
     lift        a few points of extra lightness on that same end, so a
                 button still stands off the panel once both have given up
                 most of their colour difference
     chromeSat   how much saturation the window FURNITURE keeps: the tabs,
                 the surround, the scrollbars. See the note above
                 CHROME_FILES — this is the one that stopped these palettes
                 reading as a filter over the page.
     loudHue     the hue of the one thing on the page that is allowed to
                 shout — the selected Mazes/Events tab. Defaults to the
                 accent; see the note above CHROME_LOUD for the two palettes
                 that need their own.
     loudSat     the saturation it is held at, absolutely
     loudLight   and a multiplier on its lightness, for when the tan it
                 inherits is too light for the colour to read
     glintHue    a tint for the window surround and scroll furniture's LIT
                 EDGES only — see the note above glint(), including why it
                 is scoped by file rather than by lightness. glintSat and
                 glintFrom set how faint it is and where it starts.
     neon        the accent the glows are drawn in — the glow is the light
                 end escaping, and it does not have to follow the accent
                 either

   Everything from keep down defaults to "do nothing", which is why Deep
   Purple omits all four: it is the palette that was signed off, and it comes
   out of this file byte-for-byte the same as it did before any of them
   existed.

   TWO HUES, NOT ONE, is what stops these reading as a filter laid over the
   page. A single hue applied to every brown gives a monochrome: correct, and
   completely flat, because a room lit by one colour has nothing to be lit
   AGAINST. Real palettes of this kind are two temperatures — a cold dark and
   a warm light, or the reverse — so the light reads as light rather than as
   the same colour turned up.

   The Halloween three are deliberately not variations on one idea: a lit
   pumpkin, a cauldron and a wound are three different nights. */
const THEMES = {
    /* Liminal Labyrinth's own violet, so the two sites are recognisably the
       same hand — ll-chrome.css uses 272 for its window surround. Single-hue
       on purpose: this is the palette that was signed off, and it is a
       recolour of one site to match another, not a scene. */
    purple:  { surfaceHue: 272, accentHue: 272,
               sat: 1.35, satMax: 0.70, fadeSat: 0.55, fadeSatMax: 0.34,
               gamma: 1.55, loudSat: 0.30, loudLight: 1.16, activeBright: 1.06,
               neon: [196, 139, 255], label: 'Deep Purple' },

    /* A CARVED PUMPKIN, which is two colours and always was: the rind is a
       burnt russet and only the cut edges are amber, because that is where
       the candle shows through.

       Lighter than the first version of it, and warmer. Surfaces sit at 18
       rather than 12 and the gamma is off the floor — a pumpkin lit from
       inside is a warm object in a dark room, not a dark object, and the
       first pass had pushed the rind so far down that the amber was the only
       thing left with any colour in it. The chrome keeps more of its
       saturation than the other two for the same reason: this is the one
       palette whose furniture is allowed to look like varnished wood.

       The lit end is a true amber-gold at 38. Its loud tab needs no setting
       of its own — for this palette the accent already IS the colour that
       should be shouting, so it only needs holding at a saturation the rest
       of the light end has given up. */
    pumpkin: { surfaceHue: 18, accentHue: 38,
               sat: 1.70, satMax: 0.86, fadeSat: 1.60, fadeSatMax: 0.80,
               gamma: 1.50, bone: 0.40, lift: 0.07, keep: 0.72, chromeSat: 0.58,
               loudSat: 0.58, loudLight: 1.14, activeBright: 1.06,
               neon: [255, 150, 44], label: 'Pumpkin' },

    /* DEEP PURPLE WITH SOMETHING GROWING IN IT.

       This began as violet surfaces under a full poison-green light end and
       it was the strongest of the Halloween three and also the loudest: green
       type on green panels over violet is three saturated things at once, and
       the eye has nowhere to rest. So it is now the signed-off Deep Purple
       almost exactly — same hues, same curve — and the green is a HINT rather
       than a wash.

       There are three of them, and that is the whole of it: the glow, which
       is green everywhere it appears; the selected tab, which is the one
       large green object on the page; and the lit edges that glow picks out
       of the artwork. Everything else is purple. A hint works because the
       rest of the page is not competing with it — the same green, spread
       over every light surface, was the version that got called glaring. */
    witch:   { surfaceHue: 274, accentHue: 274,
               sat: 1.35, satMax: 0.70, fadeSat: 0.58, fadeSatMax: 0.36,
               gamma: 1.55, bone: 0.30, lift: 0.03, keep: 0.45, chromeSat: 0.52,
               loudHue: 96, loudSat: 0.52, loudLight: 1.14, activeBright: 1.06,
               neon: [146, 255, 92], label: 'Witching Hour' },

    /* NOT HALLOWEEN, AND KEPT ANYWAY. This one came out of an attempt at
       blood-under-a-cold-moon and landed somewhere else entirely — a cold
       grey hull with a warm light on it — so it is being finished as what it
       actually is rather than dragged back to what it was aimed at.

       Almost all of it is grey. The surfaces carry just enough of 350 to be
       warm rather than blue-black, the light end is a cold 212 at an eighth
       of its saturation, and between them there is no colour on the page
       worth the name.

       THE RED IS NOT ON THE TAB. It was, briefly, and it was wrong: a red
       top-level tab is not a thing this layout has any use for, and a scheme
       made of greys should not have its single brightest object be the one
       thing that is not grey. The selected tab is now simply the LIGHTEST
       thing in the window — near-white, barely any hue at all — which is how
       a selected panel reads in a scheme like this one.

       The red went into the glint instead: hue 8, a sixth of full
       saturation, and only on the lit edges of the furniture. You do not
       see it so much as notice that the highlights are warm.

       The gamma is the gentlest of the four and keep is the highest,
       because grey has nothing but lightness to say anything with. Crush
       the dark end here and the whole thing is one black rectangle. */
    crimson: { surfaceHue: 350, accentHue: 212,
               sat: 0.55, satMax: 0.19, fadeSat: 0.26, fadeSatMax: 0.12,
               gamma: 1.35, bone: 0.55, lift: 0.06, keep: 0.80, chromeSat: 0.30,
               loudSat: 0.05, loudLight: 1.22, activeBright: 1.10,
               glintHue: 8, glintSat: 0.30, glintFrom: 0.11,
               neon: [255, 92, 96], label: 'Crimson' },

    /* FROST, the Christmas skin's palette (25 Oct 2026; the owner's: "in the
       mock ups for the christmas skin the site was recoloured"). A moonlit
       winter night: the browns become a midnight blue, and the light end
       goes to frost, a paler and greener ice, so the snow and icicles sit
       on something cold. Lighter than the Halloween three (keep high, gamma
       gentle): a night under snow is bright, not black. The selected tab is
       the one block of pale ice, and the furniture's lit edges glint cyan. */
    frost:   { surfaceHue: 214, accentHue: 196,
               sat: 1.70, satMax: 0.78, fadeSat: 0.70, fadeSatMax: 0.46,
               gamma: 1.15, bone: 0.25, lift: 0.08, keep: 0.92, chromeSat: 0.62,
               loudHue: 192, loudSat: 0.42, loudLight: 1.18, activeBright: 1.08,
               glintHue: 186, glintSat: 0.55, glintFrom: 0.10,
               neon: [150, 222, 255], label: 'Frost' },
    /* DARK MODE (30 Oct 2026, the owner's: "a nice sleek dark vibe, with
       some subtle glows ... readable but without it being a blinding
       white"). Not a palette the site wears but one a visitor switches on,
       from the bulb in the archive window's grab bar, over whatever palette
       or skin is showing — so it is built as a LAYER: scoped to
       html[data-dark] rather than [data-theme], loaded after the theme's
       sheet, and outranking it (see layerScope).
       Graphite, not black: the surfaces carry a little of a cool 222 so the
       five depths stay apart, and the lit end keeps a whisper of the site's
       own amber so it is still Maze Rats in the dark. The very light end is
       capped (ceil) and the near-whites the transform would otherwise leave
       alone are brought down to it (dimWhite), so nothing on the page is
       paper-white. The glows are a soft warm amber. */
    dark:    { surfaceHue: 222, accentHue: 36,
               sat: 0.50, satMax: 0.17, fadeSat: 0.60, fadeSatMax: 0.30,
               gamma: 1.40, bone: 0.55, lift: 0.04, keep: 0.78, chromeSat: 0.30,
               loudSat: 0.30, loudLight: 1.04, activeBright: 1.0,
               ceil: 0.80, dimWhite: true, layer: true,
               neon: [255, 186, 110], label: 'Dark mode' },
    /* LIGHT MODE FOR CHRISTMAS (30 Oct 2026, the owner's: "the frost palette
       is quite dark already"). What the dark-mode bulb gives while Frost is
       the palette (the switch in each page's head). The same kind of layer
       as dark mode, on its own attribute (html[data-light]), and the other
       way round: surfaces go ice, a step lighter at each depth, and every
       light ink goes a deep winter blue (invert). */
    frostlight: { surfaceHue: 208, accentHue: 216,
               sat: 1.0, satMax: 0.42, fadeSat: 1.0, fadeSatMax: 0.55,
               gamma: 1.0, invert: true, layer: true, layerAttr: 'data-light', activeBright: 1.0,
               neon: [96, 170, 255], label: 'Light mode (Christmas)' }
};


let THEME = 'purple';
let SURFACE_HUE, ACCENT_HUE, SAT, SAT_MAX, FADE_SAT, FADE_SAT_MAX, LIGHT_GAMMA, NEON, BONE, LIFT, KEEP, CHROME_SAT;
// Dark mode's three (see its row): a lightness ceiling, near-whites brought
// down to it, and output scoped as a layer over any palette.
let CEIL = 0, DIM_WHITE = false, LAYER = false;
// Light mode's: the lightness turned over rather than kept, on its own attribute.
let INVERT = false, LAYER_ATTR = "data-dark";

function useTheme(name) {
    const c = THEMES[name];
    THEME = name;
    SURFACE_HUE = c.surfaceHue; ACCENT_HUE = c.accentHue;
    SAT = c.sat; SAT_MAX = c.satMax;
    FADE_SAT = c.fadeSat; FADE_SAT_MAX = c.fadeSatMax;
    LIGHT_GAMMA = c.gamma; NEON = c.neon;
    BONE = c.bone || 0; LIFT = c.lift || 0; KEEP = c.keep || 0;
    CHROME_SAT = c.chromeSat === undefined ? 1 : c.chromeSat;
    LOUD_HUE = c.loudHue; LOUD_SAT = c.loudSat;
    LOUD_LIGHT = c.loudLight === undefined ? 1 : c.loudLight;
    ACTIVE_BRIGHT = c.activeBright === undefined ? 0.50 : c.activeBright;
    GLINT_HUE = c.glintHue; GLINT_SAT = c.glintSat === undefined ? 0.18 : c.glintSat;
    GLINT_FROM = c.glintFrom === undefined ? 0.60 : c.glintFrom;
    CEIL = c.ceil || 0; DIM_WHITE = !!c.dimWhite; LAYER = !!c.layer;
    INVERT = !!c.invert; LAYER_ATTR = c.layerAttr || "data-dark";
    LOUD_ON = c.loudHue !== undefined || c.loudSat !== undefined
           || c.loudLight !== undefined;
}

/* The light end goes the other way: saturation is CUT, not lifted. A pale
   violet at 44% is a highlighter; the same tone at 27% is lavender, and only
   one of those is readable as a paragraph of small pixel type. */

/* TWO ZONES, NOT ONE CURVE.

   A palette this size is doing two different jobs with one set of values.
   Below about half lightness it is SURFACES — the page, the window surround,
   the rows — and those want to sink. Above it, it is almost entirely TEXT:
   --amber-bright alone is a colour in 96 rules and a background in 30.

   One gamma cannot serve both. Deepening everything gave the archive the
   look it should have and simultaneously dragged --amber-bright down to
   h272 s55 l48 — a rich, saturated violet that the maze titles and the
   wordmark were then set in. Saturated purple text on a near-black page is
   the most tiring thing a screen can do.

   So dark colours are deepened, light colours are FADED — lifted a little
   and desaturated a lot, which is what turns a vivid violet into the soft
   lavender that reads easily at 11px:

       --bg-black      l  5%  ->  l  1%              (surface: sinks)
       --chrome-fill   l 14%  ->  l  5%              (surface: sinks)
       --amber-bright  l 63% s44%  ->  l 69% s27%    (text: lifts and fades)
       --parchment     l 71% s31%  ->  l 77% s17%    (text: lifts and fades)

   The two are blended with a smoothstep rather than switched at a threshold.
   A hard split at l=0.5 puts a cliff in the middle of the palette: #8a6a3d
   at l39 and --amber at l53 are neighbours in the classic theme and would
   have come out at l24 and l62, which is not a shade difference any more. */
// LIGHT_GAMMA is per theme — see THEMES above.

const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

// How far a colour counts as "text" rather than "surface".
const textness = l => smoothstep(0.38, 0.68, l);

/* ------------------------------------------------ THE THIRD ZONE: THE UI

   Two zones was still not enough, and the reason is what the light end of
   this palette is actually FOR. Above about 60% lightness the classic theme
   is not decoration at all — it is the interface. --amber-bright is a colour
   in 96 rules and a background in 30; --parchment is the body copy; the tan
   in btn_active.png is every button, pill and tab on the site.

   Colouring all of that the theme's accent hue at full strength is what made
   the palettes read as a filter laid over the page rather than as a design.
   A deep violet page with violet panels, violet rows, violet buttons and
   violet text has nothing in it that reads as a CONTROL, because a control is
   something that stands apart from its surroundings, and everything was the
   same thing at different brightnesses. Witching Hour was the worst of them
   while also being the best: green type on green panels on a violet page, and
   all of it at once, which is glare rather than contrast.

   So the very light end is pulled back towards neutral — "bone". It keeps its
   lightness, which is what makes a button leap off a near-black page, and
   gives up most of its saturation, which is what stops it shouting. The
   theme's colour does not disappear; it moves to where colour belongs:

     l < 0.38   surfaces      full surface hue, deep and saturated
     l 0.38-0.60 accents      full accent hue: lit edges, borders, glows,
                              the wordmark — this is where the palette lives
     l > 0.60   interface     bone: same hue, a fraction of the saturation

   BONE IS PER THEME because the three do not need it equally. Purple is set
   to zero and is unchanged by any of this: it was signed off as it is.

   The lightness curve gets a per-theme LIFT at the same time. It is small —
   a few percent — but it is what separates a button from the panel it sits
   on once both have lost most of their colour difference. */
const boneness = l => smoothstep(0.52, 0.80, l);

/* ------------------------------------------- GAMMA FLATTENS THE STRUCTURE

   A page like this one is not one dark colour, it is FIVE, and the order of
   them is the layout: the page behind everything, the window on top of it,
   the panel inside the window, the row inside the panel, the button on the
   row. Classic spaces them at roughly 5%, 14%, 20%, 26% and 60% lightness,
   and that spacing is the only reason any of it reads as nested.

   A gamma of 1.7 does not move those five down, it squeezes them together,
   because it takes a bigger bite the darker a colour already is: 5% becomes
   0.9% and 20% becomes 6.9%, so a gap of fifteen points closes to six. The
   page, the window and the rows all arrive at the same near-black, the
   button is the only thing left with any lightness at all, and the whole
   design reads as one flat sheet with some text on it. That — not the hue —
   is what made these palettes look like a filter over the site rather than a
   recolour of it.

   So the deep end mixes the gamma curve with a straight SCALE, which darkens
   every surface by the same proportion and therefore keeps all five gaps.
   KEEP is how much of the mix is the scale. Purple is 0 and is untouched by
   any of this. */
const DARK_SCALE = 0.55;

// asText forces the colour fully into the text zone — see TEXT_VARS.
function mapLight(l, asText) {
    const curved = Math.pow(l, LIGHT_GAMMA);
    const deep = curved + (l * DARK_SCALE - curved) * KEEP;
    const faded = 0.60 + (l - 0.5) * 0.80 + LIFT * boneness(l);
    const t = asText ? 1 : textness(l);
    let out = Math.max(0, Math.min(1, deep * (1 - t) + faded * t));
    // The ceiling compresses the top of the range rather than clipping it,
    // so the lightest things keep their order under it.
    if (CEIL && out > 0.62) out = 0.62 + (out - 0.62) * (CEIL - 0.62) / 0.38;
    return out;
}

/* The near-whites and pale greys toPurple leaves alone, for dark mode only:
   brought to the ceiling, with a breath of the accent, so white type and
   white buttons are not the brightest thing in a dark room. */
function dimWhite(r, g, b) {
    if (!DIM_WHITE) return null;
    const [, s, l] = rgbToHsl(r, g, b);
    if (l < 0.86 || s > 0.25) return null;
    return hslToRgb(ACCENT_HUE, 0.12, CEIL - (1 - l) * 0.5);
}

function mapSat(s, l, asText) {
    const deep = Math.min(SAT_MAX, s * SAT);
    const faded = Math.min(FADE_SAT_MAX, s * FADE_SAT);
    const t = asText ? 1 : textness(l);
    const mixed = deep * (1 - t) + faded * t;
    return mixed * (1 - BONE * boneness(l));
}

/* TWO HUES, NOT ONE.

   A single hue for every colour on the page is a filter, and reads as one
   however carefully the lightness is handled — the eye sees one colour and
   correctly concludes that something has been laid over the top. Real
   palettes give the dark and the light DIFFERENT hues: deep violet rooms lit
   by green, burnt umber lit by amber.

   So surfaces take one hue and the lit end takes another, crossing over at
   l 36–50%. That band is chosen from the stylesheet rather than picked: the
   browns cluster heavily below 35% and again above 50%, and the 36–50 gap
   holds only three of them. Whatever the crossover does to a colour, it does
   it to almost nothing.

   THE MIX IS DONE IN RGB, NOT AROUND THE WHEEL. Interpolating hue from 276
   to 96 passes through either teal or red depending on which way it turns,
   and both are colours nobody asked for arriving in the middle of the
   palette. Blending the two finished RGB values instead sends a purple and a
   green through a neutral grey — which is what a mid-tone between them
   should be, and is the one result that never looks like a mistake. */
const hueMix = l => smoothstep(0.36, 0.50, l);

const mixRgb = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
];

// The brown band, in degrees. Everything on this site that is "wood", "amber",
// "parchment" or "chrome" lands inside it; nothing else does.
const HUE_MIN = 12;
/* 62 rather than 55, to take the console's yellows with the rest of it. Its
   frame highlight is rgb(255,255,170) at hue 60 and cnsl-dotline is hue 60
   too; stopping at 55 left a purple console window wearing a pale yellow
   edge. Nothing in the stylesheet sits between 55 and 70 — the next colour up
   is an olive at 70 — so the wider band costs nothing and catches the pixels
   that needed it. */
const HUE_MAX = 62;
const MIN_SAT = 0.06;      // below this it is a grey, not a brown

/* Rules whose colour MEANS something, and so must keep it.

   The difficulty pills are the clearest case: easy to extreme runs green,
   gold, orange, red — a traffic light. Gold and orange are the only two
   inside the brown band, so recolouring them leaves green at one end, red at
   the other and PURPLE in the middle, which is not a scale any more. Danger
   red and warning gold go the same way: a red that has turned violet is no
   longer a warning, it is decoration.

   MATCHED ON THE RULE, NOT THE VALUE. The first version of this was a list
   of hex codes, which is wrong because a colour does not carry its meaning
   with it. #ffcb00 is the admin notice's warning gold AND the Habbo
   console's frame; excluding the value kept the console gold inside a purple
   site. Worse, the same list was being applied to the PNGs — where it
   preserved 625 pixels of that console frame and recoloured the 42 pixels of
   its shadow, producing a gold window with a purple drop shadow.

   So the art is recoloured unconditionally — every pixel in the band, no
   exceptions, because a pixel has no semantics — and only the stylesheet
   consults these lists, by asking which rule the colour is in. */
const KEEP_SELECTORS = [
    /\.difficulty-/,              // the easy -> extreme scale
    /\[data-difficulty=/,         // the same scale, on a featured row
    /\.admin-notice/,             // a warning, in warning gold
    /admin-pill-danger/           // and a destructive button's label
];

// Inside :root, where a whole-rule skip would take the entire palette with it.
// --danger-text is the lifted red the small status labels are set in (see
// :root in style.css); it is a warning for the same reason --danger is.
const KEEP_VARS = ["--danger", "--danger-text"];

/* Variables that are TEXT, whatever their lightness says.

   The transform decides "surface or text?" from a colour's lightness, which
   is right for almost the whole palette and wrong for --unknown. It is a
   mid-dark grey-brown (l 42%) that sits on the page's darkest surfaces and
   is used for nothing BUT text — the Unknown/Past badges, the quiz board's
   headings, the progress window's big numbers, some twenty rules. At l 42%
   it fell on the surface side of the curve and was sunk with the surfaces
   it is printed on: 1.4-2:1 in every theme, which is not dim, it is gone.

   So these are mapped as the light end is — faded and lifted, in the accent
   hue — exactly as --parchment-dim is, which is the token they are closest
   to in use. Everything else still goes by its lightness. (--amber-text is
   text too, but is solved rather than mapped — see solveAmberText.) */
const TEXT_VARS = ["--unknown", "--unknown-text"];

const keepsSelector = sel => KEEP_SELECTORS.some(re => re.test(sel));

const hex2 = n => n.toString(16).padStart(2, "0");
const asHex = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);
const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));

function isBrown(h, s, l) {
    return s >= MIN_SAT && l > 0.01 && l < 0.995 && h >= HUE_MIN && h <= HUE_MAX;
}

function toPurple(r, g, b, asText) {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (!isBrown(h, s, l)) return null;
    if (INVERT) return invertLight(s, l, asText);
    const sat = mapSat(s, l, asText);
    const light = mapLight(l, asText);
    // Built twice and mixed, rather than once at an interpolated hue — see
    // the note above on why the blend happens in RGB.
    const onSurface = hslToRgb(SURFACE_HUE, sat, light);
    if (SURFACE_HUE === ACCENT_HUE) return onSurface;
    return mixRgb(onSurface, hslToRgb(ACCENT_HUE, sat, light), asText ? 1 : hueMix(l));
}

/* ------------------------------------------------- CSS filters, in numbers

   Three rules in style.css do not colour themselves — they take a shared
   sprite and put it through a filter, and a fourth then hard-codes the
   colour that comes OUT of that filter so a flat rectangle can be painted
   against it. That fourth one is the merge-bridge: the band that joins the
   active sub-nav tab to the search drawer beneath it, which only works while
   its flat colour is exactly the filtered sprite's colour.

   Recolouring the sprite purple and leaving the filter alone breaks that in
   two ways at once. hue-rotate(4deg) and sepia(0.25) were tuned to nudge a
   BROWN; against violet the sepia drags it back toward brown, so a purple
   site grew brown tabs. And the bridge's flat colour was recoloured by the
   hue transform, which knows nothing about the filter, so the two ends of a
   seam that must be identical were computed two different ways.

   So the theme drops the hue-shifting parts of both filters — saturate,
   brightness and contrast are all hue-preserving and can stay — and then
   computes the bridge by running the purple sprite through the remaining
   chain HERE, in the same numbers the browser uses.

   Checked against the classic value before being trusted: the original
   comment records that #d6bb96 was found by sampling a canvas, and feeding
   the classic sprite through this code returns #d6b996 — two units on one
   channel, which is the tolerance that comment itself claims. */
/* TRUNCATES, because that is what the browser does.

   Rounding here put the merge-bridge one unit away from the drawer it is
   supposed to be invisible against. saturate(1) is the identity matrix and
   brightness(0.5) is a plain halving, so the sprite's fill of rgb(165,132,195)
   becomes (82.5, 66, 97.5) exactly — and Chrome paints 82, 66, 97 where
   Math.round gives 83, 66, 98. Checked by drawing the real sprite into a
   canvas with the same ctx.filter and reading the pixel back, rather than by
   reasoning about it. */
const clamp = v => Math.max(0, Math.min(255, Math.floor(v)));

const FILTERS = {
    saturate: ([r, g, b], s) => [
        (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
        (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
        (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b
    ],
    brightness: (px, v) => px.map(c => c * v),
    contrast: (px, v) => px.map(c => (c / 255 - 0.5) * v * 255 + 127.5)
};

function runFilter(px, chain) {
    let out = px.slice();
    for (const [fn, value] of chain) out = FILTERS[fn](out, value);
    return out.map(clamp);
}

// The flat "fill" a border-image paints across the middle of an element —
// border-image-slice: 10 fill, so the centre pixel is that colour.
function fillPixel(file) {
    const img = decodePng(fs.readFileSync(path.join(ROOT, file)));
    const i = ((img.height >> 1) * img.width + (img.width >> 1)) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/* ---------------------------------------------------------------- the art */

/* Chrome that is an <img> in the markup rather than a background in the CSS.

   Scanning style.css finds every sprite the stylesheet paints, and misses
   every sprite the HTML points at directly — which is how the maze window's
   close X stayed a tan cross on a violet titlebar. CSS cannot rewrite a src,
   so these get a `content: url()` swap further down instead.

   The rat mascot is deliberately absent. It is a character, not furniture —
   the same reasoning that leaves the maze screenshots alone — and its sprites
   are not even all brown: two of the four sit at hue 173 and 192, so a
   "recolour the browns" pass would repaint half a rat and leave the rest. */
const MARKUP_SPRITES = [
    "assets/img/modal_topclose_x.png",
    "assets/img/mazes_icon.png",
    "assets/img/events_icon.png"
];

/* console-icon.png is deliberately NOT in that list.

   It is the Habbo console handset in the top bar — a picture of a THING,
   the same as the rat mascot and the maze screenshots, rather than a piece
   of this site's furniture. The nav icons beside it are ours and take the
   palette with everything else; the handset is Habbo's and keeps its own
   colours in both themes.

   Left out rather than excluded by a rule, because there is nothing about
   the file that tells you which of the two it is — only what it depicts. */

/* ------------------------------------------- THE WINDOW FURNITURE IS NOT ART

   These eleven-odd files are not pictures of anything. They are the tab
   pills, the window surround, the title band and the scrollbars — the UI's
   own furniture, the parts a person clicks rather than looks at.

   Everything else the transform touches is artwork: the maze thumbnails'
   backdrop, the console, the icons, the stickies. Art can be any colour the
   palette likes. Furniture cannot, and that is the whole of what was wrong
   with these themes: the tab strip is a large, flat, mid-lightness area, and
   painting a large flat area in the accent hue at 39% saturation gives a slab
   of sage green across the top of the page that no amount of tuning elsewhere
   can sit next to. A pale green button on a green drawer on a violet page is
   three tints of the same idea, so nothing in it reads as a control — which
   is exactly the "everything is behind a filter" the palettes were accused
   of, and the accusation was correct.

   So the furniture is held close to NEUTRAL. It keeps its lightness, which is
   what makes the window read as a window and a button read as raised; it
   gives up most of its saturation, which is what stops it competing. The
   theme's colour is not lost, it moves to where colour does some work: the
   page behind the window, the glows, the text accents, the lit edges of the
   artwork, the difficulty scale.

   A trace of the hue is left in — chromeSat is a fraction, not zero — because
   pure grey furniture on a violet page looks like an unstyled control rather
   than a designed one.

   NONE OF THIS CAN DESYNC THE BRIDGE. #cc9966, the tab fill, appears nowhere
   in style.css: it exists only inside btn_active.png. The merge-bridge's flat
   colour is read back out of the finished sprite and filtered the way the
   browser will filter it, so it follows whatever the furniture does. */
const CHROME_FILES = [
    "btn_active.png", "btn_inactive.png", "window_frame.png",
    "title_pattern.png"
];

const isChrome = rel => {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    return CHROME_FILES.includes(base) || base.startsWith("scrollbar_");
};

/* The same furniture, where it is painted by CSS instead of by a sprite.

   Not every part of the window is a picture. The big Mazes/Events tab gives
   up on the shared sprite and paints a flat #c3a886 of its own — style.css
   explains why, at the rule — and the side MENU tab, the titlebar and the
   scroll furniture do the same. Desaturating only the PNGs left those as the
   one bright green thing left on the page, which was worse than leaving them
   all green: half-treated looks like a mistake, where all-green at least
   looked deliberate.

   Matched on the selector rather than on the colour, for the reason the
   KEEP list gives further down: #ffcb00 is both the admin notice and the
   console frame, and any list of "chrome colours" has the same problem. What
   a colour IS depends on where it is used, so the rule is what gets asked. */
const CHROME_SELECTORS = [
    /\.chrome-nav/,
    /#search-wrap/,
    /\.side-menu|#side-menu/,
    /\.chrome-titlebar|\.chrome-frame|\.chrome-window|\.chrome-close/,
    /\.chrome-tab|\.chrome-body/,
    /scrollbar|\.custom-scroll/
];

/* ...except the one tab that is SUPPOSED to be loud.

   Neutral furniture everywhere is tidy and slightly dead: nothing on the page
   is the theme's colour at full strength except the text, and a palette wants
   somewhere to actually land. The Mazes/Events pair is the biggest surface in
   the layout and the one that says which half of the archive you are looking
   at, so that is where it lands — full accent on the selected one, neutral on
   everything around it, which is how a selected tab is meant to read anyway.

   It can be excepted safely because it paints itself with a flat colour of
   its own rather than the shared sprite. The sub-nav's active tab, the search
   drawer and the merge-bridge all come out of btn_active.png and have to stay
   identical to each other, so they take the furniture treatment together and
   cannot drift apart. */
const CHROME_LOUD = [/\.chrome-nav-top .chrome-nav-btn\.active/];

const isChromeRule = sel =>
    CHROME_SELECTORS.some(re => re.test(sel)) &&
    !CHROME_LOUD.some(re => re.test(sel));

const isLoudRule = sel => CHROME_LOUD.some(re => re.test(sel));

/* The loud tab does not have to be the accent hue, and for two of these it
   must not be.

   Crimson's accent is 210, a cold steel, because that is what makes its
   greys read as greys; painting the selected tab in it would give a palette
   with no red anywhere except the glow. Witching Hour is a deep purple
   whose green is supposed to be a hint rather than a wash, and the selected
   tab is exactly the size of hint that works — one green thing, in the one
   place the eye is already looking.

   So the loud colour is its own setting. Pumpkin does not need a hue of its
   own — its accent already IS the colour that should be shouting.

   loudSat is an ABSOLUTE saturation, not a multiplier, because the whole
   point of the loud tab is that it does NOT scale with the palette around
   it. Crimson's surfaces sit at 30% and its light end at 16%; a multiplier
   big enough to lift the tab clear of that would have to be a different
   number every time one of the others moved.

   A theme that sets none of them is left completely alone rather than passed
   through HSL and back, which costs a unit to rounding. Deep Purple sets
   none, and comes out identical.

   loudLight scales the lightness, and Crimson is the reason it exists. Its
   tab inherits l 0.72 from the classic tan, and a saturated red at 0.72 is
   pink — correct, and not the colour anybody means by crimson. Pulling it to
   0.59 gets the red without taking the label below AA against it, which a
   darker tab would.

   The label is checked rather than assumed: see the contrast note in the
   corrections block. */
let LOUD_HUE, LOUD_SAT, LOUD_LIGHT, LOUD_ON;
let GLINT_HUE, GLINT_SAT, GLINT_FROM;
let ACTIVE_BRIGHT;

function loud(px) {
    if (!LOUD_ON) return px;
    const [h, s, l] = rgbToHsl(px[0], px[1], px[2]);
    return hslToRgb(LOUD_HUE === undefined ? h : LOUD_HUE,
                    LOUD_SAT === undefined ? s : LOUD_SAT,
                    Math.max(0, Math.min(1, l * LOUD_LIGHT)));
}

// Set while a chrome rule is being emitted, read by the two colour replacers.
// A flag rather than an argument because both are RegExp replace callbacks.
let IN_CHROME = false;
let IN_LOUD = false;
// Set while a TEXT_VARS declaration is being shifted, for the same reason.
let IN_TEXT = false;
// Dark mode only: what the declaration being shifted paints — "fill" (a
// background) or "ink" (a text colour) — for darkRole below.
let ROLE = null;
// The selector being emitted, for light mode's one exception below.
let CUR_SEL = "";

/* ------------------------------------------------- DARK MODE'S TWO TURNS

   Every other palette keeps the classic lightness order: a cream panel
   stays light and the brown ink on it stays dark. Dark mode cannot, or the
   search drawer, the inputs and the cream rows are the brightest things on
   a dark page. So in its layer, and only there:

     a LIGHT FILL (a background, l > 0.55) goes to a raised dark surface,
       keeping its order against the other light fills, so a lit button is
       still lighter than the panel it sits on;
     a DARK BROWN INK (the type set on those fills) goes light, under the
       ceiling, so it reads on them.

   Faint overlays (alpha under 0.6) are left alone: a white wash at 0.1 is a
   hover's lift, and turned grey it would be a shadow. */
function darkRole(r, g, b, alpha) {
    if (!LAYER || INVERT || !ROLE) return null;
    if (alpha !== undefined && alpha < 0.6) return null;
    const [h, s, l] = rgbToHsl(r, g, b);
    const brown = isBrown(h, s, l);
    /* The console frame's yellow (#ffcb00, .console-frame, which is also
       Fallin' Furni's window): its corners and edges are sprites, so its
       flat fill takes exactly what the sprites take (toPurple then
       sinkArt), or the frame comes out in two shades. */
    if (ROLE === "fill" && brown && s > 0.8 && l > 0.4) {
        const px = toPurple(r, g, b);
        return px ? sinkArt(px) : null;
    }
    if (ROLE === "fill" && l > 0.55 && (brown || s < 0.25)) {
        const light = 0.13 + (l - 0.55) * 0.42;
        return mixRgb(hslToRgb(SURFACE_HUE, Math.min(SAT_MAX, s * SAT), light),
                      hslToRgb(ACCENT_HUE, Math.min(SAT_MAX, s * SAT), light), 0.25);
    }
    if (ROLE === "ink" && brown && l < 0.36) {
        return hslToRgb(ACCENT_HUE, Math.min(FADE_SAT_MAX, s * FADE_SAT) * 0.6, CEIL - 0.04 - l * 0.25);
    }
    return null;
}
/* The art's light end, for dark mode: the cream sprites (the search drawer,
   the active tab, the spines) are fills too. Squeezed rather than turned,
   so a sprite's lit edge stays lighter than its face. */
function sinkArt(px) {
    const [h, s, l] = rgbToHsl(px[0], px[1], px[2]);
    // And most of its colour goes: sunk amber is brown, and the furniture
    // (scrollbars, frames, tabs) should be graphite like the surfaces.
    if (l <= 0.18) return hslToRgb(h, s * 0.35, l);
    return hslToRgb(h, s * 0.35, 0.18 + (l - 0.18) * 0.30);
}

/* What dark mode cannot infer: a light colour held in a variable of a rule's
   own (not :root), which the role-aware copy never sees used. The opening
   view's cream and ink (30 Oct 2026) — its headings and On now rows — are
   a raised dark surface and a soft light ink here, like every other fill
   and ink in the layer. */
/* Light mode's own, for what turns the wrong way when everything else is
   turned over: the search glass's handle (a background, so it went pale
   while the ring, a border, stayed dark); the Discord pill, whose lavender
   was picked for a dark header; and the difficulty scale, whose colours are
   kept on purpose and need the dark ground they were chosen against. */
function lightExtras() {
    const glass = asHex(...invertLightAs("line", 0.32, 0.31));
    return `
[data-theme="${THEME}"] .opening-search-icon::after {
    background: ${glass};
}
[data-theme="${THEME}"] .header-badge {
    color: #3c44a8;
    border-color: #5a63c9;
    background-color: rgba(255, 255, 255, 0.75);
}
[data-theme="${THEME}"] [class*="difficulty-"] {
    background-color: #2a3442;
}
/* The inactive tabs' own filter (saturate(0.5)) turns ice blue grey, which
   reads as disabled: here they keep their blue, and stay a step darker than
   the selected tab by their sprite alone. */
[data-theme="${THEME}"] .chrome-nav-btn:not(.active)::before {
    filter: none;
}
/* The opening view's section banners: their cream is pale here, so the
   band is a light wash of the ink and the lettering the ink, lifted. */
[data-theme="${THEME}"] .opening-head-title {
    background: color-mix(in srgb, var(--opening-ink) 14%, transparent);
    color: var(--opening-ink);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}
/* Explore's pixel icons: their lit faces stay light here (the parchment
   they are drawn in turns navy). */
[data-theme="${THEME}"] .opening-x-ico {
    --x-ico-lit: #f4f8fc;
}
/* Surprise me's die is drawn in the button's text colour, which is a deep
   navy here: its black pips vanished into it. A white face, as on dark. */
[data-theme="${THEME}"] .opening-die {
    color: #f4f8fc;
}
/* The status pills (Open, Closed...): their colour IS the word, so they sit
   on near-white ice rather than a mid blue that swallows the green. */
[data-theme="${THEME}"] .status-badge {
    background-color: rgba(246, 250, 253, 0.92);
}
/* The Christmas skin outlines the footer in navy so it reads over its drift;
   on a light page that outline is a smudge round dark type. */
[data-theme="${THEME}"][data-skin="xmas"] .fellow-fansites a,
[data-theme="${THEME}"][data-skin="xmas"] .fellow-fansites p,
[data-theme="${THEME}"][data-skin="xmas"] .fellow-fansites-title {
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
}
`;
}
/* Dark mode's own: the opening view's section banners, whose cream is a dark
   grey here, take the soft light ink, over a faint wash of it. */
function darkExtras() {
    return `
[data-theme="${THEME}"] .opening-head-title {
    background: color-mix(in srgb, var(--opening-ink) 12%, transparent);
    color: var(--opening-ink);
}
`;
}
function darkCorrections() {
    const cream = INVERT ? asHex(...hslToRgb(SURFACE_HUE, 0.40, 0.84))
                         : asHex(...mixRgb(hslToRgb(SURFACE_HUE, 0.10, 0.25), hslToRgb(ACCENT_HUE, 0.10, 0.25), 0.3));
    const ink = INVERT ? asHex(...hslToRgb(ACCENT_HUE, 0.45, 0.15)) : asHex(...hslToRgb(ACCENT_HUE, 0.16, CEIL - 0.06));
    return `
/* Dark mode's own (tools/themes.js darkCorrections). */
[data-theme="${THEME}"] .opening {
    --opening-cream: ${cream};
    --opening-ink: ${ink};
}

/* The console frame's title (the Habbo Console, Fallin' Furni's window):
   the frame is graphite here, so its title is the light ink, not black. */
[data-theme="${THEME}"] .console-title {
    color: ${ink};
}
` + (INVERT ? lightExtras() : darkExtras());
}
/* Light mode turns the page over: dark surfaces go pale, light inks go
   dark. By what the colour paints, because a single inversion would turn the
   cream drawers dark and the dark outlines pale:
     art     the sprites: squeezed into the light end, order kept, so a lit
             edge is still lighter than its face
     fill    a background: dark ones go pale ice, the cream ones a shade
             deeper than the page so they still read as panels
     ink     a text colour: light ones go deep blue, dark ones stay dark
     var     a palette variable, used every way: turned straight over
     line    borders, box shadows, outlines: stay dark, so edges hold
     glow    a text shadow: turned over, a pale lift under dark type */
function invertLightAs(role, s, l) {
    const was = ROLE; ROLE = role;
    try { return invertLight(s, l, false); } finally { ROLE = was; }
}
function invertLight(s, l, asText) {
    const role = asText ? "ink" : (ROLE || "art");
    /* ONE SURFACE SCALE for the art, the fills and the surface variables
       (round 2, his notes): mapped two ways, a window's frame art and the
       flat fill under its title came out two colours (a pale box under
       every grab bar, a darker rim round the console), and the inverted
       fill crushed the five depths into one near-white. This keeps their
       order — the page the deepest ice, each frame inside a step lighter —
       spread over the dark end where the depths are, and holds a cool tint
       (S at least 0.24) so no surface reads as greyed out. */
    /* Round 4 (his note: washed out): deeper at the dark end and more of the
       blue, so the frames are a real winter blue and the panels inside
       them ice, rather than everything a pale grey-white. */
    const surf = v => v <= 0.25 ? 0.50 + v * 1.16 : 0.79 + (v - 0.25) * 0.24;
    const surfSat = Math.min(SAT_MAX, 0.36 + s * 0.4);
    let L, S, hue = SURFACE_HUE;
    if (role === "art")       { L = surf(l); S = surfSat; }
    else if (role === "fill") { L = surf(l); S = surfSat; }
    else if (role === "ink")  { L = l > 0.45 ? 0.10 + (1 - l) * 0.35 : 0.10 + l * 0.5; S = Math.max(0.42, Math.min(FADE_SAT_MAX, s * 1.2)); hue = ACCENT_HUE; }
    /* A box shadow's colour: in the classic palette a brown one is a LIT edge
       (a button's inset top line, lighter than its face), so here it is a
       step lighter than the surface scale, never a dark line. */
    else if (role === "shade") { L = Math.min(0.97, surf(l) + 0.10); S = surfSat; }
    else if (role === "var")  {
        if (l > 0.5) { L = 0.10 + (1 - l) * 0.35; S = Math.min(FADE_SAT_MAX, s * 1.2); hue = ACCENT_HUE; }
        else { L = surf(l); S = surfSat; }
    }
    else if (role === "glow") { L = 0.97 - l * 0.5; S = Math.min(SAT_MAX, s * 0.6); }
    else                      { L = 0.20 + l * 0.35; S = Math.min(SAT_MAX, s); }
    return hslToRgb(hue, S, Math.max(0, Math.min(1, L)));
}
/* Light mode's page background (MazeBG.png): every pixel, its black lines
   too, held in a narrow pale band, so the maze is a quiet texture that the
   intro and the footer can be read over rather than a high-contrast print. */
function softBackground(r, g, b) {
    const [, , l] = rgbToHsl(r, g, b);
    // Round 3 (his note: washed out): a wider band and more of the blue, so
    // the maze reads as a snowy maze again, still pale enough to read over.
    return hslToRgb(SURFACE_HUE, 0.45, 0.56 + l * 0.40);
}
/* The greys and whites the transform leaves alone, in light mode: white type
   would vanish on the pale panels, and a solid black fill would be a hole. */
function invertAchroma(r, g, b, alpha) {
    if (!INVERT) return null;
    const [, s, l] = rgbToHsl(r, g, b);
    /* A see-through black wash on a fill (a row's rgba(0,0,0,0.25)) greys a
       pale panel, which reads as disabled: a near-white ice lift instead, so a
       row (or a status pill) sits a step brighter than its panel, as each
       depth inward is. */
    if (ROLE === "fill" && s <= 0.25 && l < 0.15 && alpha !== undefined && alpha < 0.6 && !/console/.test(CUR_SEL)) return hslToRgb(SURFACE_HUE, 0.60, 0.97);
    /* The site's solid shadows (a frame's 0 -3px band, a row's 2px drop) are
       black at 30-45%: on brown they barely show, on ice they read as a
       second, thicker border. A deep navy at half the strength instead. */
    if (ROLE === "shade" && s <= 0.25 && l < 0.15 && alpha !== undefined) { const px = hslToRgb(SURFACE_HUE, 0.55, 0.20); px.alphaScale = 0.5; return px; }
    // A dark shadow under type that is now dark is a smudge: a pale lift.
    if (ROLE === "glow" && s <= 0.25 && l < 0.3) return [255, 255, 255];
    if (alpha !== undefined && alpha < 0.6) return null;
    if (s > 0.25) return null;
    // Not on the console's screen, which stays the dark screen it is.
    if (ROLE === "ink" && l > 0.8 && !/console/.test(CUR_SEL)) return hslToRgb(ACCENT_HUE, 0.45, 0.14);
    if (ROLE === "fill" && l < 0.2) return hslToRgb(SURFACE_HUE, 0.35, 0.90);
    return null;
}
const FILL_PROPS = ["background", "background-color", "background-image"];
const INK_PROPS = ["color", "-webkit-text-fill-color"];

/* The classic palette's own variables, for a declaration that paints with
   one: in the dark layer a fill of var(--parchment) is a light fill, and is
   turned like a written one. Read from style.css's :root. */
let CLASSIC_VARS = null;
function classicVars() {
    if (CLASSIC_VARS) return CLASSIC_VARS;
    CLASSIC_VARS = {};
    const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
    const root = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    if (root) for (const m of root[1].matchAll(/(--[\w-]+):\s*#([0-9a-fA-F]{6})\b/g)) {
        CLASSIC_VARS[m[1]] = [0, 2, 4].map(i => parseInt(m[2].substr(i, 2), 16));
    }
    return CLASSIC_VARS;
}
// Held as tokens through shiftValue (which would otherwise shift the
// already-turned colour a second time) and put back by darkVarsBack.
const DARK_HELD = [];
function darkVars(value) {
    if (!LAYER || !ROLE) return value;
    return value.replace(/var\((--[\w-]+)\)/g, (match, name) => {
        const c = classicVars()[name];
        const px = c && (INVERT ? toPurple(c[0], c[1], c[2]) : darkRole(c[0], c[1], c[2]));
        if (!px) return match;
        DARK_HELD.push(asHex(...px));
        return "@@dark" + (DARK_HELD.length - 1) + "@@";
    });
}
const darkVarsBack = value => value.replace(/@@dark(\d+)@@/g, (m, i) => DARK_HELD[+i]);

/* ------------------------------------------------------------- THE GLINT

   Where a palette's colour shows on furniture that has otherwise given its
   colour up: in the HIGHLIGHTS, and nowhere else.

   Every one of these sprites is lit the same way — a fill with a lighter
   band along its top and left, which is what makes a button look raised and
   a window frame look like it has an edge. Those bands are already the only
   part of the furniture the eye reads as a surface catching light, so they
   are the natural place to put a tint, and putting it ONLY there is what
   keeps it a hint rather than a wash.

   Crimson is why this exists. Its tab was painted a full red, which put the
   loudest colour in the palette on the top-level navigation — a red tab does
   not mean anything in this layout, and a scheme built out of greys should
   not have its brightest object be the one thing that is not grey. So the
   red left the tab and went into the frame instead: barely-there, well off
   true red, and only on the lit edge.

   IT IS SCOPED BY FILE, NOT BY LIGHTNESS, and that is the second attempt.
   The first drove it off a lightness threshold, on the assumption that every
   sprite here is a fill with a lighter band along its top. Two of them are
   not: btn_active.png is a single flat colour across all 2,322 of its opaque
   pixels — it IS the raised state, so it has no highlight to pick out — and
   btn_inactive's fill sits at l 0.35 with its own highlight at 0.63, which
   is the same lightness as btn_active's fill. No threshold can separate "the
   lit edge of a button" from "the whole of the button next to it", so a band
   low enough to catch the frame tinted the buttons and the search drawer as
   well, and dark grey buttons came out a dull red.

   The window surround does have a real highlight — fills at l 0.06-0.08, a
   lit edge at 0.15 — so the frame and the scroll furniture take the glint
   and nothing else does. The ramp within them is still soft rather than a
   cut, because a hard edge across a bevel reads as a shape rather than as
   shading. */
const GLINT_FILES = rel => {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    return base === "window_frame.png" || base.startsWith("scrollbar_");
};

function calmChrome(px) {
    if (CHROME_SAT >= 1) return px;
    const [h, s, l] = rgbToHsl(px[0], px[1], px[2]);
    return hslToRgb(h, s * CHROME_SAT, l);
}

function glint(px) {
    if (GLINT_HUE === undefined) return px;
    const [, , l] = rgbToHsl(px[0], px[1], px[2]);
    const t = smoothstep(GLINT_FROM, GLINT_FROM + 0.10, l);
    if (t <= 0) return px;
    return mixRgb(px, hslToRgb(GLINT_HUE, GLINT_SAT, l), t);
}

/* ------------------------------------------ THE GRIP DOTS ARE A RATIO, NOT
                                               A COLOUR

   title_pattern.png is a 16x16 tile of single pixels, and the only thing it
   is for is to be faintly visible against the bar behind it — the grips
   either side of every titlebar, the face of the ENTER button. In classic
   its dot (#4c3622) sits on --chrome-fill (#39250f) at a contrast ratio of
   1.285: a texture, deliberately almost nothing.

   Run through the palette like any other brown, that ratio collapsed. Both
   the dot and the bar are near the bottom of the range, and the bottom of
   the range is exactly where a lightness curve has the least room, so the
   two arrived within 1.06 of each other and the grips disappeared. Nothing
   about the tile was wrong; it was still there, still recoloured, and no
   longer a texture.

   So it is not transformed, it is SOLVED. The themed dot keeps the hue and
   saturation the palette gives it and takes whatever lightness restores the
   classic ratio against the themed fill. Every rule that uses this tile pairs
   it with background-color: var(--chrome-fill) — all four of them, checked —
   so there is one background to solve against and the answer is exact.

   Bisected rather than inverted because the contrast formula runs through
   the sRGB transfer curve and the hue is in HSL; twenty steps gets it well
   inside a single 1/255 level, and it happens four times per build. */
const GRIP_TILE = "title_pattern.png";

const relLum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
    const x = relLum(a), y = relLum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function classicVar(name) {
    const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
    const m = css.match(new RegExp(name + ":\\s*#([0-9a-fA-F]{6})"));
    if (!m) throw new Error(name + " is not in css/style.css any more");
    return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16));
}

const classicChromeFill = () => classicVar("--chrome-fill");

/* --amber-text: THE AMBER, LIFTED ONLY AS FAR AS TEXT NEEDS.

   --amber is a border and fill colour that two dozen rules also set small
   text in — the row's builder line, the eyebrows, the pills, the progress
   counts. It lands among the accents (l 53%), which is right for a border,
   and on the rows the text in it measured 3.9:1 in Deep Purple, 3.6:1 in
   Witching Hour and 4.3:1 in Crimson. style.css gives those rules
   --amber-text instead, the same value as --amber in classic.

   Not added to TEXT_VARS. Mapped as text it came out at #a090af in Deep
   Purple against a --parchment-dim of #9f92aa: readable, and no longer an
   accent at all — every eyebrow and builder name turned into body copy. So
   it is SOLVED, the way the grip dot is: the themed --amber keeps its hue
   and saturation and takes the lightness that gives it classic's own ratio
   against --chrome-row (5.1:1), and never less than 4.5:1. A palette whose
   --amber already clears that (Pumpkin) is left exactly as it is.

   And 4.5:1 on the lightest surface it is actually set on, too (1 Oct
   2026). --chrome-row is the darkest of them. The guide's "In this guide"
   box is --frame-bg under a 22% black wash (.guide-contents), and Crimson's
   solved value came out at 4.47:1 there. The archive rows' wash is darker
   (25%), so the box is the one that binds. The answer is the lightest of
   the two, so a palette that already clears both still keeps its --amber.

   And on --frame-bg with no wash at all (27 Oct 2026, the overnight audit).
   Witching Hour's builder lines on the Featured rows came to 4.57:1 —
   through, but only just, and the audit measured them against the bare
   frame, where they were 4.23:1 (Deep Purple 4.24, Crimson 4.12, Frost
   4.08). The Featured rows' wash is a translucent black, so anything that
   thins it, or a line set straight on the frame, lands there. 4.5:1 on the
   bare frame puts every one of them clear on every surface it is set on;
   Pumpkin already was, and keeps its value. */
const CONTENTS_WASH = 0.22;
function solveAmberText() {
    const fg = classicVar("--amber");
    const bg = classicVar("--chrome-row");
    const frame = classicVar("--frame-bg");
    const target = Math.max(4.5, contrast(fg, bg));
    const themedBg = toPurple(bg[0], bg[1], bg[2]) || bg;
    const themedFrame = toPurple(frame[0], frame[1], frame[2]) || frame;
    // Not rounded: the wash composites in floats, and rounded down the box
    // read a shade darker than measured and let 4.49:1 through.
    const themedBox = themedFrame.map(c => c * (1 - CONTENTS_WASH));
    // The bare frame is the lightest of the three, so with it in, it is the one that binds.
    const passes = px => contrast(px, themedBg) >= target && contrast(px, themedBox) >= 4.5
        && contrast(px, themedFrame) >= 4.5;
    const themedFg = toPurple(fg[0], fg[1], fg[2]) || fg;
    if (passes(themedFg)) return themedFg;
    const [h, s, l0] = rgbToHsl(themedFg[0], themedFg[1], themedFg[2]);
    let lo = l0, hi = 1, best = themedFg;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        const px = hslToRgb(h, s, mid);
        if (!passes(px)) lo = mid;
        else { hi = mid; best = px; }
    }
    return best;
}

/* The dot the tile should carry in this theme, given the dot and the fill it
   carries in the classic one. */
function solveGrip(classicDot, fill) {
    const target = contrast(classicDot, fill);
    const themedFill = toPurple(fill[0], fill[1], fill[2]) || fill;
    const themedDot = toPurple(classicDot[0], classicDot[1], classicDot[2]) || classicDot;
    const [h, s] = rgbToHsl(themedDot[0], themedDot[1], themedDot[2]);
    // Which side of the fill the dot sits on in classic, and stays on here.
    const up = relLum(classicDot) > relLum(fill);
    let lo = up ? rgbToHsl(themedFill[0], themedFill[1], themedFill[2])[2] : 0;
    let hi = up ? 1 : rgbToHsl(themedFill[0], themedFill[1], themedFill[2])[2];
    let best = themedDot;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        best = hslToRgb(h, s, mid);
        if (contrast(best, themedFill) < target) { if (up) lo = mid; else hi = mid; }
        else { if (up) hi = mid; else lo = mid; }
    }
    return best;
}

/* THE RECOLOURED ART IS ADDRESSED BY ITS CONTENT.

   Everything under /assets/* is served with a year's immutable cache
   (netlify.toml), on the understanding that a picture changes by getting a
   new name. These files break that: this script rewrites them IN PLACE,
   under the same name, whenever a palette or the art under it changes — so
   a returning visitor would have gone on seeing last month's purple tabs
   for up to a year, beside a stylesheet that had moved on.

   So every reference the theme stylesheet makes to one of them carries
   ?v=<the first 8 hex of the file's own SHA-1>. Same bytes, same address,
   and the cache is still used for everything that did not change; a file
   that did change is a new URL and is fetched once. The stylesheet itself
   is revalidated on every visit (/css/*), which is what gets the new
   address to the browser. Keyed on the classic path, the same as the Set
   recolourAssets returns, and refilled on every theme pass. */
const crypto = require("crypto");
const ART_VERSION = new Map();

const artUrl = rel => {
    const v = ART_VERSION.get(rel);
    return "../assets/img/" + THEME + "/" + rel.replace(/^assets\/img\//, "") + (v ? "?v=" + v : "");
};

function recolourAssets() {
    ART_VERSION.clear();
    const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
    const refs = [...new Set([
        ...[...css.matchAll(/url\('\.\.\/(assets\/img\/[^']+\.png)'\)/g)].map(m => m[1]),
        ...MARKUP_SPRITES
    ])];

    const done = [];
    for (const rel of refs) {
        const src = path.join(ROOT, rel);
        if (!fs.existsSync(src)) continue;
        let img;
        try { img = decodePng(fs.readFileSync(src)); } catch (e) { continue; }

        const furniture = isChrome(rel);
        const grip = rel.endsWith("/" + GRIP_TILE) || rel.endsWith(GRIP_TILE);
        const glintFile = GLINT_FILES(rel);
        const fill = grip ? classicChromeFill() : null;
        const out = Buffer.from(img.data);
        let changed = 0;
        for (let i = 0; i < out.length; i += 4) {
            if (out[i + 3] === 0) continue;                  // transparent
            let px = grip
                ? solveGrip([out[i], out[i + 1], out[i + 2]], fill)
                : INVERT && /MazeBG/.test(rel)
                    ? softBackground(out[i], out[i + 1], out[i + 2])
                    : toPurple(out[i], out[i + 1], out[i + 2]);
            if (!px) continue;                                // grey/black/white
            if (furniture && !grip) {
                px = calmChrome(px);
                if (glintFile) px = glint(px);
            }
            // Not the close boxes (the X and the bulb): small lit marks, not
            // fills, and sunk with the rest they all but vanished.
            if (LAYER && !INVERT && !/topclose/.test(rel)) px = sinkArt(px);
            out[i] = px[0]; out[i + 1] = px[1]; out[i + 2] = px[2];
            changed++;
        }
        // Nothing brown in it — the greyscale scrollbars, the pointer, the
        // blue bow. Not copied at all, so the theme keeps pointing at the
        // original and there is only ever one file to maintain.
        if (!changed) continue;

        const dest = path.join(ROOT, rel.replace(/^assets\/img\//, "assets/img/" + THEME + "/"));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const png = encodePng(img.width, img.height, out);
        fs.writeFileSync(dest, png);
        ART_VERSION.set(rel, crypto.createHash("sha1").update(png).digest("hex").slice(0, 8));
        done.push(rel);
    }
    return new Set(done);
}

/* ---------------------------------------------------------------- the CSS */

const HEX = /#([0-9a-fA-F]{3,8})\b/g;
const RGB = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;



function shiftHex(match, body) {
    let h = body;
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    let alpha = "";
    if (h.length === 8) { alpha = h.slice(6); h = h.slice(0, 6); }
    if (h.length !== 6) return match;
    const rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    const turned = darkRole(rgb[0], rgb[1], rgb[2], alpha ? parseInt(alpha, 16) / 255 : undefined);
    if (turned) return "#" + hex2(turned[0]) + hex2(turned[1]) + hex2(turned[2]) + alpha;
    let px = toPurple(rgb[0], rgb[1], rgb[2], IN_TEXT);
    if (!px) { px = invertAchroma(...rgb, alpha ? parseInt(alpha, 16) / 255 : undefined) || dimWhite(...rgb); if (px) return "#" + hex2(px[0]) + hex2(px[1]) + hex2(px[2]) + alpha; }
    if (!px) return match;
    if (IN_CHROME) px = calmChrome(px);
    else if (IN_LOUD) px = loud(px);
    return "#" + hex2(px[0]) + hex2(px[1]) + hex2(px[2]) + alpha;
}

function shiftRgb(match, r, g, b, a) {
    let px = darkRole(+r, +g, +b, a === undefined ? undefined : +a);
    if (px) return a === undefined ? `rgb(${px[0]}, ${px[1]}, ${px[2]})` : `rgba(${px[0]}, ${px[1]}, ${px[2]}, ${a})`;
    px = toPurple(+r, +g, +b, IN_TEXT);
    if (!px) {
        px = invertAchroma(+r, +g, +b, a === undefined ? undefined : +a) || dimWhite(+r, +g, +b);
        if (px && px.alphaScale && a !== undefined) a = String(+(a * px.alphaScale).toFixed(3));
        if (!px) return match;
    } else if (IN_CHROME) px = calmChrome(px);
    else if (IN_LOUD) px = loud(px);
    return a === undefined
        ? `rgb(${px[0]}, ${px[1]}, ${px[2]})`
        : `rgba(${px[0]}, ${px[1]}, ${px[2]}, ${a})`;
}

// Whether a value has anything this theme would change.
function touches(value, recoloured) {
    if (value.replace(HEX, shiftHex) !== value) return true;
    if (value.replace(RGB, shiftRgb) !== value) return true;
    for (const rel of recoloured) if (value.includes(rel.replace("assets/img/", ""))) return true;
    return false;
}

function shiftValue(value, recoloured) {
    let out = value.replace(HEX, shiftHex).replace(RGB, shiftRgb);
    for (const rel of recoloured) {
        const tail = rel.replace("assets/img/", "");
        out = out.split("../assets/img/" + tail).join(artUrl(rel));
    }
    return out;
}

/* Properties this theme repaints, and the values that mean "do not paint".

   Only these pairs count as a reset. A blanket "copy anything without a
   colour" would drag layout across into the theme file — widths, paddings,
   display — and an override stylesheet that can move things is a much bigger
   thing to trust than one that can only recolour them. */
const PAINT_PROPS = [
    "background", "background-color", "background-image",
    "border", "border-color", "border-image", "border-image-source",
    "box-shadow", "text-shadow", "filter", "color", "outline"
];

/* Put the theme's own attribute in front of a selector.

   :root and html ARE the element carrying data-theme, so they take it
   directly; everything else is a descendant of it. Both raise specificity by
   one attribute selector, which is what makes these win against the rules
   they are overriding without a single !important. */
function scope(selector) {
    return selector.split(",").map(one => {
        const s = one.trim();
        if (!s) return "";
        if (s === ":root" || s.startsWith(":root")) return s.replace(":root", `:root[data-theme="${THEME}"]`);
        if (s === "html" || s.startsWith("html")) return s.replace("html", `html[data-theme="${THEME}"]`);
        return `[data-theme="${THEME}"] ` + s;
    }).filter(Boolean).join(",\n");
}

/* A deliberately small CSS reader.

   It walks the file once, tracking whether it is inside an at-rule, and hands
   back {selector, body, at} for every rule. This stylesheet has no nesting
   beyond @media and @supports, so that is all it has to understand — and a
   real parser would be a dependency carried for one build script.

   @font-face and @keyframes are skipped outright: a keyframe's "0%" is not a
   selector and scoping it produces garbage, and a font has no colour. */
function rules(css) {
    const out = [];
    let i = 0, at = null, atDepth = 0;
    while (i < css.length) {
        const brace = css.indexOf("{", i);
        if (brace === -1) break;
        const head = css.slice(i, brace).trim();

        if (head.startsWith("@")) {
            const name = head.split(/[\s(]/)[0];
            if (name === "@font-face" || name === "@keyframes" || name === "@-webkit-keyframes") {
                i = skipBlock(css, brace);
                continue;
            }
            at = head; atDepth = 1; i = brace + 1;
            continue;
        }

        const end = skipBlock(css, brace);
        out.push({ selector: head, body: css.slice(brace + 1, end - 1), at });
        i = end;

        // Leaving the at-rule's own closing brace, if the next thing is one.
        if (at) {
            const next = css.slice(i).match(/^\s*\}/);
            if (next) { i += next[0].length; at = null; atDepth = 0; }
        }
    }
    return out;
}

function skipBlock(css, openBrace) {
    let depth = 0;
    for (let i = openBrace; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") { depth--; if (!depth) return i + 1; }
    }
    return css.length;
}

/* The rules the transform refused to touch, put back where the cascade can
   see them. They are byte-identical to their source; the only thing added is
   the theme attribute, which is what gets them past the generic rules that
   the transform just promoted above them. */
function keptBlock(kept) {
    if (!kept.length) return "";
    return "\n/* ------------------------------------------- COLOUR THAT IS INFORMATION\n"
        + "\n   Not recoloured, and re-stated here so it still wins. The difficulty\n"
        + "   scale, the admin notice and the danger label mean what they mean\n"
        + "   BECAUSE of their colour, so a palette that re-tinted them would be\n"
        + "   deleting the content. See the note in buildCss. */\n"
        + kept.join("\n\n") + "\n";
}

function buildCss(recoloured) {
    const raw = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    const parts = [];
    const kept = [];
    let ruleCount = 0, declCount = 0;

    for (const rule of rules(css)) {
        /* A rule whose colour carries meaning is not recoloured — but it is
           RE-EMITTED, unchanged, at the theme's specificity.

           Skipping it outright was not enough, and this is the same fault the
           long note below describes in a different costume. .difficulty-hard
           is one class; the generic .tag rule it overrides gains the theme
           attribute here and becomes two, so leaving the difficulty rule out
           did not preserve it — it demoted it. Every maze in the archive came
           out with its difficulty in the theme's own colour, and the easy /
           medium / hard / extreme scale, which is the one place on this site
           where the colour IS the information, stopped saying anything.

           Copied verbatim it goes back to outranking the generic rule by
           source order, and the scale reads the same in every palette. */
        if (keepsSelector(rule.selector)) {
            const held = rule.body.split(";")
                .map(d => d.trim()).filter(Boolean)
                .map(d => "    " + d + ";");
            if (held.length) {
                kept.push(scope(rule.selector) + " {\n" + held.join("\n") + "\n}");
            }
            continue;
        }
        CUR_SEL = rule.selector;
        IN_CHROME = isChromeRule(rule.selector);
        IN_LOUD = isLoudRule(rule.selector);
        const keep = [];
        for (const decl of rule.body.split(";")) {
            const colon = decl.indexOf(":");
            if (colon === -1) continue;
            const prop = decl.slice(0, colon).trim();
            const value = decl.slice(colon + 1).trim();
            if (!prop || !value) continue;
            // --danger lives in :root alongside the whole palette, so it is
            // skipped by name rather than by skipping the rule it is in.
            if (KEEP_VARS.includes(prop)) continue;
            /* EVERY PAINT DECLARATION IS COPIED, not only the ones whose
               value this theme would change.

               Copying selectively is what made this file dangerous. Each
               copy gains the theme's attribute selector, so it outranks any
               source rule of equal specificity that came after it — and if
               that later rule was not itself copied, the theme silently
               resurrects a paint the stylesheet had already overridden. It
               happened twice:

                 · .chrome-close paints a white gradient and
                   .chrome-close:has(img) removes it. Only the gradient had a
                   colour in it, so only the gradient was copied — and a white
                   box came back behind the maze window's close X.

                 · .admin-rail-group .btn-enter-mini clears its background and
                   the .active rule then fills it with var(--chrome-highlight).
                   The clear was copied, the fill was not (a var() has no
                   colour to substitute), and the selected segment lost its
                   highlight.

               Two different shapes of the same mistake, which is the point:
               patching each one as it appears is endless, because the fault
               is the selective copying itself. Mirroring every paint
               declaration makes the theme a faithful paint-only copy of the
               cascade, so ORDER IS PRESERVED BY CONSTRUCTION and neither can
               happen again. Declarations that need no substitution come out
               identical to their source and simply re-assert it.

               Costs 4.7KB gzipped, measured — 4.8KB to 9.5KB. Cheap for a
               whole class of bug. Only paint is mirrored: layout, spacing
               and typography are never copied, so this file still cannot
               move anything, only colour it. */
            // Solved against --chrome-row rather than shifted; see solveAmberText.
            if (prop === "--amber-text") {
                keep.push("    --amber-text: " + asHex(...solveAmberText()) + ";");
                declCount++;
                continue;
            }
            /* Shifted from the value it had before classic's was lifted for
               contrast (#a89a84 → #c1b7a7, 1 Oct 2026). The themes already
               passed with that one; mapped from the new value their dim text
               came out almost as bright as --parchment, and the quiet tier
               all but vanished. Only the classic palette needed the lift. */
            if (prop === "--parchment-dim" && /^\s*#c1b7a7\s*$/i.test(value)) {
                keep.push("    --parchment-dim: " + shiftValue("#a89a84", recoloured) + ";");
                declCount++;
                continue;
            }
            if (!touches(value, recoloured) && !PAINT_PROPS.includes(prop)) continue;
            IN_TEXT = TEXT_VARS.includes(prop);
            ROLE = FILL_PROPS.includes(prop) ? "fill" : INK_PROPS.includes(prop) ? "ink"
                 : !INVERT ? null : prop.startsWith("--") ? "var" : prop === "text-shadow" ? "glow" : prop === "box-shadow" ? "shade" : "line";
            keep.push("    " + prop + ": " + darkVarsBack(shiftValue(darkVars(value), recoloured)) + ";");
            IN_TEXT = false; ROLE = null;
            declCount++;
        }
        IN_CHROME = false; IN_LOUD = false;
        if (!keep.length) continue;
        ruleCount++;
        const block = scope(rule.selector) + " {\n" + keep.join("\n") + "\n}";
        parts.push(rule.at ? rule.at + " {\n" + block.replace(/^/gm, "    ") + "\n}" : block);
    }

    const header = `/* GENERATED FILE - do not edit by hand.

   Built by tools/themes.js from css/style.css. Re-run that after
   changing any colour, or this theme silently keeps the old one:

       node tools/themes.js

   Every rule here is scoped to [data-theme="${THEME}"], so this stylesheet is
   completely inert until js/site.js puts that attribute on <html>. The
   classic palette is not defined here and is not affected by anything in it.

   ${ruleCount} rules, ${declCount} declarations, hues ${SURFACE_HUE} (surfaces) / ${ACCENT_HUE} (accents).
*/
`;
    const body = header + parts.join("\n\n") + "\n" + keptBlock(kept) + corrections() + (LAYER ? darkCorrections() : "");
    fs.writeFileSync(path.join(ROOT, "css/theme-" + THEME + ".css"), LAYER ? layerScope(body) : body, "utf8");
    return { ruleCount, declCount };
}

/* Dark mode is worn OVER a palette, not instead of one, so its sheet is
   rescoped from [data-theme="dark"] to html[data-dark]: one element and one
   attribute, which outranks a palette's [data-theme=…] copy of the same rule
   and ties the classic-only html:not([data-theme]) rules (the sheet is
   linked after style.css, so it wins those on order). A copy of one of
   those classic-only rules becomes html[data-dark]:not([data-dark]) and
   matches nothing, as its [data-theme] copy does in every palette. */
function layerScope(css) {
    const own = `[data-theme="${THEME}"]`;
    return css
        .split(`:root${own}`).join(`:root[${LAYER_ATTR}]`)
        .split(`html${own}`).join(`html[${LAYER_ATTR}]`)
        .split(own).join(`html[${LAYER_ATTR}]`)
        .split(":not([data-theme])").join(`:not([${LAYER_ATTR}])`);
}

/* Everything the transform cannot work out for itself, appended after it so
   it wins on source order.

   Two kinds of thing live here. The FILTER CORRECTIONS are forced: they
   depend on running a sprite through a filter, which is not something a
   find-and-replace over colour values can do. The GLOWS are a design
   choice — neon is not a hue shift, and there is nothing in the classic
   stylesheet to derive them from. */
function corrections() {
    /* THE TWO LABEL COLOURS, DERIVED RATHER THAN WRITTEN.

       Both of these used to be violet literals (#f1e6ff and #1b0a29) left
       over from when purple was the only theme, and they went on being violet
       in the Halloween palettes — a lavender label on a gold pumpkin tab.

       They are ends of the same palette as everything else, so they are built
       from it. The pale one takes the ACCENT hue, because it sits on a
       darkened surface and belongs with the lit end; the dark one takes the
       SURFACE hue, because it sits on a light tab and belongs with the page.
       Both are almost out of colour already — 95% and 10% lightness — so the
       hue only decides which way the tint leans. */
    // Dark mode turns every label's ground dark, so both are its soft light
    // ink, under the ceiling rather than near-white.
    const paleLabel = INVERT ? asHex(...hslToRgb(ACCENT_HUE, 0.45, 0.14)) : LAYER ? asHex(...hslToRgb(ACCENT_HUE, 0.20, CEIL - 0.02)) : asHex(...hslToRgb(ACCENT_HUE, 1.0, 0.951));
    const darkLabel = LAYER ? paleLabel : asHex(...hslToRgb(SURFACE_HUE, 0.608, 0.10));

    // The chain the active tab and the search drawer keep, minus the
    // hue-rotate: what is left is hue-preserving, so it can be applied to a
    // violet sprite and still mean what it meant.
    /* THE LADDER.

       Five surfaces, and the order of them is the layout. Every palette
       spaces them the same way now, because that spacing is what makes the
       window read as a window rather than as a tinted sheet:

           selected top tab    l 0.82-0.89   the lightest thing on the page
           this trio           l 0.67-0.70   a clear step below it
           unselected tabs     l ~0.35       set behind their neighbour
           the buttons         l ~0.35       neutral, whatever the palette
           the page            l < 0.10

       The first two are the ones that had to be solved. They have to be
       clearly different from each other, because the drawer sits directly
       under the tab and the two would otherwise merge into one shape — and
       both have to take a readable label.

       The drawer used to go DOWN to l32 for that separation. It worked, and
       it left every selected tab floating over a near-black slot. It goes up
       instead now, so the selected half of the window reads as one lit panel
       with a brighter tab at the top of it.

       WHAT IT MUST NOT DO IS LAND IN THE MIDDLE. At l48, where brightness
       0.80 once put it, a light label scored 3.93:1 and a dark one 3.96:1 —
       a mid tone is the one place where NEITHER works, and picking either
       would only have been choosing which way to be wrong. Hence the jump
       clear of it, and hence the label below being measured rather than
       assumed.

       Crimson takes 1.10 where the others take 1.06: its sprite has already
       given up its saturation, so it starts a shade darker. */
    const ACTIVE_CHAIN = [["saturate", 1.0], ["brightness", ACTIVE_BRIGHT]];
    const bridge = runFilter(fillPixel("assets/img/" + THEME + "/btn_active.png"), ACTIVE_CHAIN);
    const bridgeHex = asHex(bridge[0], bridge[1], bridge[2]);

    // Which of the two labels actually reads on that drawer. See the rule.
    const subDark = contrast(bridge, hexToRgb(darkLabel))
                  > contrast(bridge, hexToRgb(paleLabel));
    const subLabel = subDark ? darkLabel : paleLabel;

    /* THE CONSOLE'S TWO LABELS, MEASURED THE SAME WAY (27 Oct 2026, the
       overnight scan).

       The active tab's label was left to the transform, which darkened
       classic's #996600 along with everything else, onto a tab sprite the
       transform had darkened too: 1.29:1 in Witching Hour, 1.50:1 in Frost
       — the selected tab was the one whose name could not be read. Its
       unselected neighbours were already inverted (the list further down);
       this one out-specifies that rule (three classes), so it needs its
       own. And the title, on the frame's own fill, came to 2.1-4.1:1.

       Both are measured, as the sub-nav's label is: the dark label and the
       pale against what they actually sit on, and the better one taken;
       short of 4.5:1, pushed to black or white on the same side. The tab
       is read out of the recoloured sprites themselves — every opaque
       pixel in the band the label covers, on all four active tabs, and the
       label has to clear the worst of them. The title sits on the frame's
       flat fill (.console-frame's #ffcb00, recoloured as the generated rule
       recolours it), between the grips. */
    function measuredLabel(grounds) {
        const worst = label => Math.min(...grounds.map(g => contrast(g, hexToRgb(label))));
        const darkWins = worst(darkLabel) >= worst(paleLabel);
        let label = darkWins ? darkLabel : paleLabel;
        if (worst(label) < 4.5) label = darkWins ? "#000000" : "#ffffff";
        return { label, ratio: worst(label) };
    }
    const tabGrounds = [];
    for (const tab of ["profile", "contact", "people", "privacy"]) {
        const file = path.join(ROOT, "assets/img", THEME, "console", "cnsl-tab-site-" + tab + "-active.png");
        if (!fs.existsSync(file)) continue;
        const img = decodePng(fs.readFileSync(file));
        // .console-tab-label: top 27px, 0.4rem (6.4px) type; inset from the tab's bevelled sides.
        for (let y = 27; y < 35; y++) {
            for (let x = 6; x < img.width - 6; x++) {
                const i = (y * img.width + x) * 4;
                if (img.data[i + 3] < 128) continue;
                const px = [img.data[i], img.data[i + 1], img.data[i + 2]];
                if (!tabGrounds.some(g => g[0] === px[0] && g[1] === px[1] && g[2] === px[2])) tabGrounds.push(px);
            }
        }
    }
    const tabLabel = tabGrounds.length ? measuredLabel(tabGrounds) : { label: paleLabel, ratio: NaN };
    const consoleFill = toPurple(0xff, 0xcb, 0x00) || [0xff, 0xcb, 0x00];
    const titleLabel = measuredLabel([consoleFill]);
    for (const [what, m] of [["console tab label", tabLabel], ["console title", titleLabel]]) {
        if (!(m.ratio >= 4.5)) console.warn("  !! " + THEME + ": the best " + what + " is " + m.label + " at " + m.ratio.toFixed(2) + ":1");
    }

    /* THE LABELS ON AN --amber FILL, MEASURED THE SAME WAY.

       The chips and counts that fill with --amber — the selected tag chip,
       the paused slideshow pill, the jump list's counts, the admin nav's
       counts, a marked dead-end chip, the pill that is showing an older
       picture — carry a dark label, and the transform darkens it along with
       everything else. On classic's tan that is 5.9:1. But --amber is a MID
       tone in every palette, and a mid tone is exactly where the ladder note
       above says neither label is safe: the dark one measured 3.9:1 in Deep
       Purple, 3.65:1 in Witching Hour and 4.3:1 in Crimson.

       Adding them to the invert list below was the obvious fix and is wrong
       twice over: pale on Pumpkin's gold is 2.97:1, and pale on Crimson's
       steel (3.97:1) is worse than the dark it would replace. So both
       candidates are measured against this theme's own --amber, and the
       better one is used; where even that is short of 4.5:1 it is pushed to
       the pure end on the same side — white for Deep Purple, black for
       Crimson — which is as far as a label can go without changing the
       fill, and the fill is a design decision rather than a bug. */
    const amberClassic = classicVar("--amber");
    const amberFill = toPurple(amberClassic[0], amberClassic[1], amberClassic[2]) || amberClassic;
    /* The dark candidate is what the transform already makes of these rules'
       own darkest label (#1a0f04, .admin-nav-count's), not darkLabel above:
       darkLabel is l 10% and scored 5.5:1 on Pumpkin's gold where the
       transformed label scores 6.3:1, and a palette that already passed
       should come out of this no worse. */
    const amberDark = asHex(...(toPurple(0x1a, 0x0f, 0x04) || [0x1a, 0x0f, 0x04]));
    const amberDarkWins = contrast(amberFill, hexToRgb(amberDark)) >= contrast(amberFill, hexToRgb(paleLabel));
    let amberLabel = amberDarkWins ? amberDark : paleLabel;
    if (contrast(amberFill, hexToRgb(amberLabel)) < 4.5) amberLabel = amberDarkWins ? "#000000" : "#ffffff";
    const amberRatio = contrast(amberFill, hexToRgb(amberLabel));
    if (amberRatio < 4.5) {
        console.warn("  !! " + THEME + ": the best label on --amber is " + amberLabel + " at "
            + amberRatio.toFixed(2) + ":1 — the fill itself needs to move");
    }

    return `
/* ============================================================ CORRECTIONS */

/* The active sub-nav tab, the search drawer under it, and the bridge that
   joins them — all three painted from ONE colour, computed by
   tools/themes.js by running the purple sprite through the same filter
   the browser will. hue-rotate is dropped because it was tuned against brown;
   saturate and brightness are hue-preserving and stay. */
[data-theme="${THEME}"] .chrome-nav-btn.active::before,
[data-theme="${THEME}"] #search-wrap::before,
[data-theme="${THEME}"] #browse-window.is-opening .opening-search-bar::before {
    filter: saturate(1) brightness(${ACTIVE_BRIGHT});
}

[data-theme="${THEME}"] .chrome-nav-sub .chrome-nav-btn.active::after {
    background: ${bridgeHex};
}

/* THE SUB-NAV'S OWN LABEL, MEASURED RATHER THAN ASSUMED.

   It used to be listed with the rest of the inverted labels, on the reasoning
   that this theme darkens the tab sprites and a darkened surface wants a pale
   label. That reasoning holds for as long as every palette darkens them, and
   Crimson does not: its drawer is brightened to ${ACTIVE_BRIGHT} because a
   near-white selected tab needs something lighter than a near-black drawer
   under it for the two to read as related. A pale label on that would have
   been white on light grey.

   So the label is not chosen, it is measured — both candidates against the
   colour the filter actually lands on, and whichever wins. ${subDark
       ? "Here that is the dark one, and the neon halo goes with it: a glow "
         + "under dark letters on a light surface is a smudge."
       : "Here that is the pale one."}

   Listed in its own right rather than folded into the group above, because
   style.css sets this with three classes and the generated block re-emits it
   with the theme attribute on top. That out-specifies a two-class selector,
   so leaving it out does not fall back to the generic rule — it falls back to
   the generated near-black, which is how it once ended up at 2.3:1. */
[data-theme="${THEME}"] .chrome-nav-sub .chrome-nav-btn.active {
    color: ${subLabel};${subDark ? "\n    text-shadow: none;" : ""}
}

/* The inactive tabs lose their sepia for the same reason: 25% sepia on a
   violet sprite is 25% of the way back to the brown this theme exists to
   replace. The rest of the chain is hue-neutral and does the actual work of
   sitting them behind their active neighbour. Their
   brightness rises from 0.66 to 0.95 to pay for the deeper source art: the
   sprite underneath is already far darker than the brown one this number was
   chosen against, and 0.66 on top of that left the inactive tabs as black
   rectangles with no readable edge at all. */
[data-theme="${THEME}"] .chrome-nav-btn::before {
    filter: saturate(0.5) brightness(0.95) contrast(1.05);
}

/* ------------------------------------------------- LABELS THAT MUST INVERT

   The classic theme builds its active and solid buttons as a LIGHT tan
   surface with a near-black label on it. This theme deepens those surfaces
   into violet, and a hue transform has no way to know that the near-black
   text was only near-black BECAUSE its background was pale — so it faithfully
   darkened both, and left the active tab reading 1.83:1 against its own
   background. Not subtly wrong: unreadable.

   So the labels invert where the surface did. Each of these is a rule whose
   background is --amber, --amber-bright, or one of the tab sprites, all of
   which this theme darkens.

   .admin-pill-solid:hover is deliberately NOT in the list. Its background is
   #fff8ec, a near-white that stays near-white through the transform, so its
   dark label is still the correct one — inverting it would have created the
   exact problem this block exists to fix. */
[data-theme="${THEME}"] .btn:hover,
[data-theme="${THEME}"] .btn.btn-solid,
[data-theme="${THEME}"] .chrome-body .btn,
[data-theme="${THEME}"] .modal-body .btn,
[data-theme="${THEME}"] .chrome-nav-btn.active,
[data-theme="${THEME}"] .console-tab-label,
[data-theme="${THEME}"] .featured-frame .chrome-nav-btn-recommended {
    color: ${paleLabel};
}

/* The labels on a flat --amber fill: not inverted but measured, because a
   mid-tone fill takes neither label reliably. ${amberRatio.toFixed(2)}:1 here. See
   tools/themes.js. .old-versions-pill.is-showing moved here from the list
   above: its fill is --amber too, and pale on it failed in three palettes. */
[data-theme="${THEME}"] .gallery-pause.is-paused,
[data-theme="${THEME}"] .old-versions-pill.is-showing,
[data-theme="${THEME}"] .tag-chip.selected,
[data-theme="${THEME}"] .archive-empty-jump-count,
[data-theme="${THEME}"] .admin-nav-count,
[data-theme="${THEME}"] .de-chip.is-marked {
    color: ${amberLabel};
}

/* The dark label carried its own light text-shadow to lift it off the tan.
   Reversed with the text: a pale halo under pale letters is a smudge. */
[data-theme="${THEME}"] .chrome-nav-btn.active {
    text-shadow: 0 0 6px rgba(${NEON[0]}, ${NEON[1]}, ${NEON[2]}, 0.45);
}

/* ...but the Mazes/Events pair keeps its dark label, because its surface did
   NOT darken with the rest: it is one of the light values the fade zone
   lifts, ending at l71. Measured both ways rather than assumed — dark scores
   8.23:1 there and light only 1.90:1, which is the same mistake as the
   original bug with the sign flipped. More specific than the rule above, so
   it wins without !important.

   The solid admin pills are left out of the list above for the same reason:
   their background is --amber-bright, now a light lavender, so the dark
   label the transform already gives them is the correct one. */
[data-theme="${THEME}"] .chrome-nav-top .chrome-nav-btn.active {
    color: ${darkLabel};
    text-shadow: none;
}

/* The console's selected tab and its title: measured, not inverted (see
   tools/themes.js). The tab label ${tabLabel.ratio.toFixed(2)}:1 on its sprite at its
   worst pixel, the title ${titleLabel.ratio.toFixed(2)}:1 on the frame. Three classes on the
   tab, as style.css has it, so it beats the generated one. */
[data-theme="${THEME}"] .console-tab-btn.active .console-tab-label {
    color: ${tabLabel.label};
}

[data-theme="${THEME}"] .console-title {
    color: ${titleLabel.label};
}

/* ------------------------------------------------ SPRITES IN THE MARKUP

   A stylesheet cannot change an <img src>, but it can replace what the
   element renders. The content property on a replaced element is how the
   close X, the two nav icons and the console icon get their purple copies —
   the markup still points at the classic file, and classic still shows it.

   Matched on the end of the src so it works wherever the page is served
   from: /home.html asks for "assets/img/..." and /wizard/<room> resolves the
   same file through a <base>, and a prefix match would only catch one. */
${MARKUP_SPRITES.map(rel => {
        const file = rel.replace(/^assets\/img\//, "");
        return `[data-theme="${THEME}"] img[src$="${file}"] {\n` +
               `    content: url('${artUrl(rel)}');\n}`;
    }).join("\n\n")}

/* =================================================================== NEON

   Light, not paint. Every glow here is a shadow in the accent violet and
   nothing is given a new background colour, so the pixel art underneath is
   never flattened or hidden — it reads as the chrome being lit rather than
   recoloured again.

   Kept to things that are ALREADY the focus: the wordmark, a window's title,
   the tab you are on, the control under your pointer. Glowing everything at
   once is just a brighter page with no hierarchy left. */
[data-theme="${THEME}"] {
    --neon: rgb(${NEON[0]}, ${NEON[1]}, ${NEON[2]});
    --neon-soft: rgba(${NEON[0]}, ${NEON[1]}, ${NEON[2]}, 0.55);
    --neon-faint: rgba(${NEON[0]}, ${NEON[1]}, ${NEON[2]}, 0.22);
}

/* The wordmark, lit like a sign. Two shadows: a tight one for the letter
   edges and a wide one for the spill. */
[data-theme="${THEME}"] .brand-title,
[data-theme="${THEME}"] .brand-mark {
    text-shadow: 0 0 6px var(--neon-soft), 0 0 18px var(--neon-faint);
}

/* A window's own title, and the section headings set in the pixel face. */
[data-theme="${THEME}"] .chrome-titlebar,
[data-theme="${THEME}"] .modal-titlebar,
[data-theme="${THEME}"] .frame-title,
[data-theme="${THEME}"] .admin-sidebar-title {
    text-shadow: 0 0 5px var(--neon-soft), 0 0 14px var(--neon-faint);
}

/* THE ACTIVE TAB GETS NO GLOW AT ALL. Neither inset nor outer.

   This is the one element on the page that cannot have one, and it took two
   goes to accept it. The active sub-nav tab, the search drawer beneath it
   and the bridge between them are meant to read as ONE CONTINUOUS SURFACE —
   that is the entire purpose of the bridge — and a glow is a halo around an
   element's edge. Around this element, that edge is the seam.

     · The inset version tinted the inside of the tab, lifting it toward the
       neon violet while the drawer stayed exactly #524261.
     · The outer version was no better: an outer shadow spills onto whatever
       is next to it, and what is next to it is the drawer. It lightened the
       tab and the top of the drawer unevenly, which is why the seam was
       plainly visible in purple and invisible in classic — classic has no
       neon to spill.

   Both times every COLOUR involved was already identical: same sprite, same
   filter, same computed bridge. Verified by laying a reference swatch of
   #524261 inside both surfaces with the drawer's contents hidden — invisible
   on both. The mismatch was never a colour, it was a shadow painted on top
   of two colours that already matched, and no amount of re-deriving the
   colour could ever have found it.

   The tab does not need it. It is already lighter than its inactive
   neighbours, because it is a different sprite. */

/* Anything you are pointing at or have tabbed to. focus-visible is included
   deliberately — a keyboard user gets the same signal a mouse user does,
   which the classic theme does with a border it cannot make brighter. */
[data-theme="${THEME}"] .chrome-list-row:hover,
[data-theme="${THEME}"] .chrome-list-row:focus-visible,
[data-theme="${THEME}"] .admin-action-pill:hover,
[data-theme="${THEME}"] .admin-pill-btn:hover,
[data-theme="${THEME}"] .btn-enter-mini:hover,
[data-theme="${THEME}"] .header-badge:hover {
    box-shadow: 0 0 9px var(--neon-faint);
}

/* A field being typed into. */
[data-theme="${THEME}"] input:focus,
[data-theme="${THEME}"] textarea:focus,
[data-theme="${THEME}"] select:focus {
    box-shadow: 0 0 8px var(--neon-soft);
}

/* The window itself, given the faintest halo so it lifts off the tiled
   background instead of sitting flat against it. Deliberately the weakest
   glow on the page — it is the largest surface, and anything stronger turns
   into a purple fog behind everything else. */
[data-theme="${THEME}"] .chrome-window,
[data-theme="${THEME}"] .modal {
    box-shadow: 0 0 26px rgba(${NEON[0]}, ${NEON[1]}, ${NEON[2]}, 0.10);
}
`;
}

/* One pass per theme. The transform keeps no state between them — useTheme
   swaps the numbers and everything downstream reads them fresh — so the only
   thing a new palette costs is its row in THEMES.

   Pass a name to build just one:  node tools/themes.js pumpkin  */
const only = process.argv[2];
if (only && !THEMES[only]) {
    console.error("No such theme: " + only + ". Known: " + Object.keys(THEMES).join(", "));
    process.exit(1);
}
for (const name of (only ? [only] : Object.keys(THEMES))) {
    useTheme(name);
    const recoloured = recolourAssets();
    const { ruleCount, declCount } = buildCss(recoloured);
    const bytes = fs.statSync(path.join(ROOT, "css/theme-" + THEME + ".css")).size;
    console.log(THEMES[name].label + "  (" + name + ", " + THEMES[name].surfaceHue + "/" + THEMES[name].accentHue + ")");
    console.log("  art : " + recoloured.size + " files -> assets/img/" + name + "/");
    console.log("  css : " + ruleCount + " rules, " + declCount + " declarations, "
        + (bytes / 1024).toFixed(1) + "KB");
}

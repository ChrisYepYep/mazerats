/* Rat Race's art (12 Oct 2026): every sprite drawn by hand, pixel by pixel.

   Each picture is rows of letters, one letter a pixel, "." clear; the
   letters are looked up in a palette. Nothing here is Habbo's: Scout, the
   coin, the key and the rest are the game's own (the owner's, 12 Oct 2026:
   "drop the use of any Habbo assets ... replace them with something of our
   own", and "every single individual item should look like what it's
   supposed to be"). Drawn for a 320 x 224 screen on a 16-pixel grid.

   Everything faces RIGHT; the game mirrors it to face left. */
(function () {
    "use strict";

    // One palette for the whole game, so everything shares the same light.
    const pal = {
        k: "#1a0f08",                                   // the outline
        // Scout
        H: "#8f5a2b", L: "#c08445", h: "#5f3a19", b: "#2a1608",          // hat, its light, its shade, its band
        r: "#5a3517",                                                      // hair
        s: "#f3c08a", S: "#cc8c58", e: "#1a0f08",                          // skin, its shade, eye
        O: "#6d7d33", l: "#91a64c", o: "#4b5720",                          // shirt, light, shade
        g: "#4a2c12", y: "#e8b83c",                                        // strap and belt, buckle
        Y: "#b5823a", u: "#86591f",                                        // shorts, shade
        B: "#6e401c", d: "#3b2010",                                        // boots, shade
        w: "#ffffff",
        // gold (the coin, the key)
        1: "#4a2e04", 2: "#9a6410", 3: "#d39a1e", 4: "#f2cc4e", 5: "#fff3b8",
        // the coin's glint (13 Oct 2026)
        ";": "#ffffff",
        // iron
        i: "#23232b", j: "#44444f", m: "#74748a", n: "#b2b2c4",
        // fire
        f: "#7a1e06", F: "#d2420c", t: "#f5841a", T: "#ffc840", W: "#fff4c4",
        // wood
        6: "#24140a", 7: "#3a2210", 8: "#55331a", 9: "#74482a", A: "#96633a", C: "#b88350", D: "#d9a76b",
        // the maze rat
        G: "#a3a3ae", R: "#6c6c78", p: "#ee9fb0", P: "#bd6a7c",
        // stone (the door's arch)
        E: "#2f2a27", K: "#4d4641", M: "#6f665e", N: "#958a7e",
        // the bat
        "+": "#3b2340", "=": "#6a3f72", "*": "#ff5050",
        // the ruby
        "!": "#5a0f1a", "@": "#a3172b", "$": "#e0384e", "%": "#ffb0bc",
        // the back wall, in shadow
        J: "#2d1a0d", U: "#22140a", I: "#170d06", 0: "#0f0803",
        // the timbers in front of it (posts, rails, braces), half in shadow
        a: "#3a2312", Q: "#4a2e18", Z: "#5e3c20",
        // cobwebs
        c: "#b4b4bc", q: "#74747c",
        // cloth (the banners)
        x: "#5e1414", X: "#9a2424", z: "#cf3a3a",
        // moss
        v: "#2f5a26", V: "#4f8a3a",
        // hemp (the rope): lit, mid, shaded, the groove between its strands
        "(": "#ecd29a", ")": "#c9a160", "[": "#946d34", "]": "#5c3f19",
        // old timber gone grey in the damp (the weathered ladder, 21 Oct 2026): lit, mid, shade, a dark split
        "<": "#74695a", ">": "#544a3e", "{": "#3c342b", "}": "#211c17",
        // candle wax (22 Oct 2026): lit by its flame, ivory, in shade, deep shade
        "^": "#fff3d2", "~": "#e2cfa2", "&": "#ae976a", "?": "#6f5c3e",
        // the wax just under a flame, its light glowing through it
        "'": "#ffd890",
        // bottle glass's glint
        ":": "#b9e39c"
    };

    /* ---------------------------------------------------------------- SCOUT
       16 x 24. The upper body is shared by most frames; the run, the jump
       and the rest change from the shoulders down. */
    const HEAD = [
        "................",
        "......kkkkk.....",
        ".....kLLHHHk....",
        ".....kLHHHHhk...",
        "....kbbbbbbbk...",
        "..kkHHHHHHHHhkk.",
        ".khhhhhhhhhhhhhk",
        "..kkkkkkkkkkkkk.",
        "....krrssssssk..",
        "....krrsssssesk.",
        "....krsssssssSk.",
        "....kkrssssSSkk.",
        ".....kkSSSSkk..."
    ];
    const BLINK = HEAD.slice(0, 9).concat(["....krrsssssSsk."], HEAD.slice(10));
    const legsStand = [
        "....kOOlllOOk...",
        "...kOOOOgOOOOk..",
        "...kOlOOOgOOOOk.",
        "...kOlOOOOgOOOk.",
        "...ksSkggggyggk.",
        "....kYYYYYYYYk..",
        "....kYYukkuYYk..",
        "....kSSk..kSSk..",
        "....kBBk..kBBk..",
        "...kBBBk..kBBBk.",
        "...kkkkk..kkkkk."
    ];
    const runA = [
        "....kOOlllOOk...",
        "...kOOOOgOOOOk..",
        "..kOlOOOOgOOOOk.",
        "..ksSOOOOOgOOOsk",
        "...kkkggggyggkk.",
        "....kYYYYYYYYk..",
        "...kYYuk..kuYYk.",
        "..kSSk.....kSSk.",
        ".kBBk.......kBBk",
        "kBBk.......kBBBk",
        "kkk........kkkkk"
    ];
    const runB = [
        "....kOOlllOOk...",
        "...kOOOOgOOOOk..",
        "...kOlOOOgOOOOk.",
        "...ksSOOOOgOOsk.",
        "...kkkggggyggk..",
        ".....kYYYYYYk...",
        ".....kYukYYk....",
        ".....kSSkSk.....",
        ".....kBBkBk.....",
        "....kBBBBBBk....",
        "....kkkkkkkk...."
    ];
    const runC = [
        "....kOOlllOOk...",
        "...kOOOOgOOOOk..",
        "..kOlOOOOgOOOOk.",
        "..ksSOOOOOgOOOsk",
        "...kkkggggyggkk.",
        "....kYYYYYYYYk..",
        "...kuYYk..kYYuk.",
        "..kSSk.....kSSk.",
        ".kBBk.......kBBk",
        "kBBk.......kBBBk",
        "kkk........kkkkk"
    ];
    /* THE RUN, SIX FRAMES (23 Oct 2026, the owner's: "when running for long periods of time, it just looks like he's
       dragging one of his legs behind him": runA and runC had his legs the same way round, so one leg was always the
       one behind). Now a stride each leg in turn: the near leg (bright) reaching forward, then planted under him as
       the far one (in shade) kicks up behind, then passing, its knee coming through; and the same with the far leg.
       His arms out at the stride, in at the pass. */
    const RUN_ARMS_OUT = ["....kOOlllOOk...", "...kOOOOgOOOOk..", "..kOlOOOOgOOOOk.", "..ksSOOOOOgOOOsk", "...kkkggggyggkk."];
    const RUN_ARMS_IN = ["....kOOlllOOk...", "...kOOOOgOOOOk..", "...kOlOOOgOOOOk.", "...ksSOOOOgOOsk.", "...kkkggggyggk.."];
    const RUN_LEGS = [
        // the near leg reaching forward, the far one pushing off behind
        ["....kYYYYYYYYk..", "...kuuuk..kYYYk.", "..kSSk.....kSSk.", ".kddk.......kBBk", "kddk.......kBBBk", "kkk........kkkkk"],
        // the near leg planted under him, the far one kicked up behind
        ["....kYYYYYYYYk..", "...kuuk.kYYYk...", "..kSSkk.kSSk....", ".kddk..kBBBk....", ".kk...kBBBBk....", "......kkkkkk...."],
        // passing: the near leg under him, the far knee coming through
        ["....kYYYYYYYYk..", ".....kYYuuuk....", ".....kSSkSSk....", ".....kBBkddk....", "....kBBBkkk.....", "....kkkkk......."],
        // the far leg reaching forward, the near one pushing off behind
        ["....kYYYYYYYYk..", "...kYYYk..kuuuk.", "..kSSk.....kSSk.", ".kBBk.......kddk", "kBBk.......kdddk", "kkk........kkkkk"],
        // the far leg planted, the near one kicked up behind
        ["....kYYYYYYYYk..", "...kYYk.kuuuk...", "..kSSkk.kSSk....", ".kBBk..kdddk....", ".kk...kddddk....", "......kkkkkk...."],
        // passing: the far leg under him, the near knee coming through
        ["....kYYYYYYYYk..", ".....kuuYYYk....", ".....kSSkSSk....", ".....kddkBBk....", "....kdddkkk.....", "....kkkkk......."]
    ];
    const RUN6 = RUN_LEGS.map((legs, i) => (i % 3 === 0 ? RUN_ARMS_OUT : RUN_ARMS_IN).concat(legs));
    /* SLIDING DOWN A STEEP SLOPE (23 Oct 2026, the owner's: "he needs a sliding sprite/animation, similar to mario"):
       sat back on it, his legs out ahead down the slope, his boots' toes up, a hand behind him trailing on the rock. */
    const SLIDE_DOWN = [BLANK_ROW(), BLANK_ROW(), BLANK_ROW(), BLANK_ROW(), BLANK_ROW(), BLANK_ROW()].concat(HEAD.slice(1, 13), [
        "...kOOOOgOOOOk..",
        "..kOlOOOOgOOOk..",
        ".ksSkggggyggkk..",
        ".kk.kYYYYYYYkBBk",
        "....kYuSSSSSSkBk",
        "....kkkkkkkkkkkk"
    ]);
    function BLANK_ROW() { return "................"; }
    // Jumping: the front arm thrown up, the back one down, the knees tucked.
    const jumpUp = [
        "....kOOlllOOk.sk",
        "...kOOOOgOOOOkOk",
        "..ksOlOOOgOOOk..",
        "...kkOOOOOgOk...",
        "....kkggggyk....",
        "....kYYYYYYYk...",
        "...kYYukkkYYYk..",
        "..kSSk...kSSk...",
        "..kBBk..kBBBk...",
        ".kBBBk..kkkkk...",
        ".kkkkk.........."
    ];
    const fall = [
        "....kOOlllOOk...",
        "..kkOOOOgOOOOkk.",
        ".ksOOlOOOgOOOOsk",
        ".kk.kOOOOOgOOkk.",
        "....kkggggyggk..",
        "....kYYYYYYYYk..",
        "...kYYuk..kuYYk.",
        "...kSSk....kSSk.",
        "..kBBk......kBBk",
        ".kBBBk.....kBBBk",
        ".kkkkk.....kkkkk"
    ];
    const scout = rows => HEAD.concat(rows);

    /* ---------------------------------------------------------------- THINGS */
    /* The coin (13 Oct 2026, its fifth drawing). The third drawing's design,
       which read best: a bright rim lit from the top left, a dark groove
       inside it, and a diamond struck in the middle, its facets catching the
       same light; at 13 x 13 (one pixel smaller, the owner's "slightly
       smaller", and odd, so the diamond has a true middle), with a white
       glint. The fourth (12 x 12, a slot) lost the contrast that made it read.
       It spins: face, three-quarters (its thickness on the far side), edge on
       (milled), the back three-quarters. Drawn by hand, compared magnified
       against the earlier coins (scratchpad ratrace/coin6.js, coin8.js). */
    const COIN = [
        [
            "....11111....",
            "..115555511..",
            ".15;22222441.",
            ".15233333241.",
            "1523335333431",
            "1523355433431",
            "1523555443431",
            "1523344233421",
            "1523334333421",
            ".14233333421.",
            ".14444444221.",
            "..113332211..",
            "....11111...."
        ],
        [
            "....1111.....",
            "...155431....",
            "..15222431...",
            "..15232431...",
            ".1523532421..",
            ".1525542421..",
            ".1525442321..",
            ".1524424321..",
            ".1423234321..",
            "..14444321...",
            "..14333221...",
            "...132221....",
            "....1111....."
        ],
        [
            ".....111.....",
            "....15421....",
            "....14321....",
            "....15421....",
            "....14321....",
            "....15421....",
            "....14321....",
            "....15421....",
            "....14321....",
            "....14421....",
            "....14321....",
            "....13221....",
            ".....111....."
        ],
        [
            ".....1111....",
            "....145541...",
            "...14522241..",
            "...14523241..",
            "..1452353241.",
            "..1452554241.",
            "..1352544231.",
            "..1352442431.",
            "..1342323431.",
            "...13444431..",
            "...13433321..",
            "....123221...",
            ".....1111...."
        ]
    ];

    /* The key (13 Oct 2026, its fourth drawing): upright, as the old games
       drew a small key. A ring at the top with a round hole through it, lit
       from the top left; a collar where it meets the shaft; the shaft down;
       two teeth standing out to the right at the bottom. 12 x 20. And the
       corner's, the same, 8 x 14. */
    const KEY = [
        "...111111...",
        "..15554441..",
        ".1554444431.",
        ".1541..1431.",
        ".151....131.",
        ".141....121.",
        ".1431..1321.",
        ".1433113221.",
        "..13333221..",
        "...113211...",
        "..15544321..",
        "..12333221..",
        "....1531....",
        "....1531111.",
        "....15344431",
        "....1531111.",
        "....1531....",
        "....1531111.",
        "....15344431",
        "....11111111"
    ];
    const KEY_ICON = [
        "..1111..",
        ".154441.",
        "151..131",
        "141..121",
        ".143321.",
        "..1321..",
        "..1531..",
        "..153111",
        "..153441",
        "..153111",
        "..1531..",
        "..153111",
        "..153441",
        "..111111"
    ];

    /* A wall torch, as a castle has them (12 Oct 2026: the first drawings
       read as a stick, a spade, then a goblet): a wooden stave, its head
       wrapped in pitch-soaked cloth, set through an iron ring on a plate
       riveted to the wall. The flame (four frames) burns on the head. 14 x 19. */
    const TORCH_BASE = [
        "...kFtTTtFk...",
        "...k886688k...",
        "...k688668k...",
        "...k668866k...",
        "...k866886k...",
        "....kkkkkk....",
        "....kA987k....",
        ".kkkkA987kkkk.",
        ".knknmmmmnknk.",
        ".kjkjiiiijkjk.",
        ".kjjkA987kjjk.",
        ".kjjkA987kjjk.",
        ".knjkA987kjnk.",
        ".kkkkA987kkkk.",
        "....kA987k....",
        "....kA987k....",
        ".....kA8k.....",
        ".....k87k.....",
        "......kk......"
    ];
    /* THE MINE'S OTHER LAMPS (17 Oct 2026, the owner's: "some that hang from
       ceilings by a chain, some that go on the wall similar to our current
       lantern, but smaller and enclosed (oil lamp, maybe?), and some that sit
       on the floor"). Each lit from inside, its glass amber; the flame in it
       is drawn by the game, flickering (see A LAMP). */
    // A miner's cage lantern, to hang on a chain: a ring, a domed cap, the glass behind two guard bars, a base. 12 x 16.
    const LAMP_HANG = [
        ".....kk.....",
        "....k..k....",
        "....kkkk....",
        "...kmnnmk...",
        "..kmnnnnmk..",
        ".kjmmmmmmjk.",
        ".kkkkkkkkkk.",
        ".kjtkTTktjk.",
        ".kjTkTTkTjk.",
        ".kjTkTTkTjk.",
        ".kjTkTTkTjk.",
        ".kjtkTTktjk.",
        ".kkkkkkkkkk.",
        ".kjmnnmmmjk.",
        "..kjjjjjjk..",
        "...kkkkkk..."
    ];
    // An oil lamp on a wall bracket: a glass chimney over a brass font, standing in an iron cup on a plate. 12 x 17.
    const LAMP_OIL = [
        ".....kk.....",
        "....ktTk....",
        "....kTTk....",
        "...ktTTtk...",
        "..ktTTTTtk..",
        "..kTTTTTTk..",
        "..ktTTTTtk..",
        "...kkkkkk...",
        "..k345432k..",
        ".k23455432k.",
        "..k122221k..",
        "...kkkkkk...",
        "....kmjk....",
        "...knmmjk...",
        "..knnmmmjk..",
        "..kmkjjkjk..",
        "...kkkkkk..."
    ];
    // A hurricane lantern to stand on the floor: a wire bail over a cap, a round glass globe, the fuel tank under it. 12 x 17.
    const LAMP_FLOOR = [
        "...kkkkkk...",
        "..k......k..",
        ".k...kk...k.",
        ".k..kmnk..k.",
        ".k.kmnnmk.k.",
        ".kkjmmmmjkk.",
        "..kkkkkkkk..",
        "..ktTTTTtk..",
        ".ktTTTTTTtk.",
        ".kTTTTTTTTk.",
        ".kTTTTTTTTk.",
        ".ktTTTTTTtk.",
        "..ktTTTTtk..",
        "..kkkkkkkk..",
        ".kjmnnmmmjk.",
        ".kjjmmmmjjk.",
        "..kkkkkkkk.."
    ];
    /* CANDLES (22 Oct 2026, the owner's: "We need more lighting options, make some candles, a few variants of a
       single candle on it's own, a couple of hanging candles etc, any other ideas too", and then: "Make sure all the
       candles are of the highest quality you can possibly make them"). Ivory wax, round: a lit stripe down its left,
       its right in shade, darker at its foot; the wax under the flame glowing through, warm (lit with the flame, by
       the game, as a lamp's glass is); runs of wax down it, a shadow under each. Every one an odd number of pixels
       wide, so its wick, its flame and (hanging) its chains sit on one middle column. The flames are drawn by the
       game at each wick (CANDLES: where), their foot at the wick. */
    // a candle w wide (odd; its outline in), its wick on row 0, its melted top on row 1, its body down to row h; drips: [column, length]
    function waxCandle(w, h, drips) {
        const P = Array.from({ length: h + 1 }, () => Array(w).fill(".")), wc = (w - 1) >> 1, R = w - 2;
        P[0][wc] = "k";
        // the round body: lit stripe (a pixel in from the left on the wide ones), ivory, its right in shade
        const body = x => (w >= 7 ? (x === 2 ? "^" : x === R ? "&" : "~") : (x === 1 ? "^" : x === R ? "&" : "~"));
        for (let y = 1; y <= h; y++) {
            P[y][0] = "k"; P[y][w - 1] = "k";
            for (let x = 1; x <= R; x++) {
                if (y === 1) P[y][x] = x === wc ? "?" : x === R ? "~" : x === 1 ? "^" : "&";    // the rim, the pool melted round the wick
                else if (y === 2) P[y][x] = x === R ? "&" : "'";                                // the wax under the flame, glowing through
                else if (y === 3 && h > 4) P[y][x] = x === R ? "&" : x === wc || x === wc - 1 ? "'" : body(x);
                else if (y === h && h > 3) P[y][x] = x === R ? "?" : x === 1 ? "~" : "&";       // its foot, in the shadow of what it stands in
                else P[y][x] = body(x);
            }
        }
        // the runs of wax, lit (in the shade, on its right, only as light as the ivory), a shadow under each
        for (const [c, n] of drips || []) {
            for (let y = 2; y < 2 + n && y < h; y++) P[y][c] = c === R ? "~" : "^";
            if (2 + n < h) P[2 + n][c] = c === R ? "?" : "&";
        }
        return P.map(r => r.join(""));
    }
    // parts laid one over another into a w x h picture: [rows, x, y], later over earlier
    function lay(w, h, parts) {
        const P = Array.from({ length: h }, () => Array(w).fill("."));
        for (const [rows, x, y] of parts) rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== "." && P[y + j] && x + i >= 0 && x + i < w) P[y + j][x + i] = r[i]; });
        return P.map(r => r.join(""));
    }
    // A pillar candle on a pewter saucer, wax pooled in it. 13 x 13.
    const CANDLE_PILLAR = lay(13, 13, [[waxCandle(7, 9, [[1, 4], [4, 2]]), 3, 0], [[
        "kmn^~~~~~&nmk",
        ".kjmmmmmmmjk.",
        "..kkkkkkkkk.."], 0, 10]]);
    // A stub, burnt nearly down, its wax spread over the floor round it. 13 x 7.
    const CANDLE_STUB = lay(13, 7, [[waxCandle(7, 4, [[1, 2]]), 3, 0], [[
        "..k^~~~~~&k..",
        ".k^~~~~~~~&k.",
        "k^~~&~~~~&~&k",
        ".kk?kkkkk?kk."], 0, 3]]);
    // Three together, tall, middling and short, standing in one pool of their wax. 17 x 15.
    const CANDLE_TRIO = lay(17, 15, [
        [waxCandle(7, 12, [[1, 6], [4, 3]]), 1, 0],
        [waxCandle(5, 8, [[1, 3]]), 11, 4],
        [waxCandle(7, 5, [[1, 2], [5, 1]]), 5, 7],
        [[
            ".k^~~~~~~~~~~~&k.",
            "k^~~~~~~&&~~~~~&k",
            ".kkk?kkkkkkk?kkk."], 0, 12]]);
    // A taper in a brass chamberstick: its socket, its dish, a ring to carry it by. 13 x 15.
    const CANDLE_TAPER = lay(13, 15, [[waxCandle(5, 10, [[1, 3]]), 4, 0], [[
        "...k34543k...",
        "....k232k..4.",
        "..k3455543k.3",
        "...k12221k.2.",
        "....kkkkk...."], 0, 10]]);
    // An iron candelabrum: three tapers in cups on arms curling up from one stem, on a round foot. 17 x 23.
    const CANDLE_ARMS = lay(17, 23, [
        [waxCandle(5, 6, [[1, 2]]), 0, 2], [waxCandle(5, 8, [[1, 3]]), 6, 0], [waxCandle(5, 6, [[3, 2]]), 12, 2],
        [[
            "knnnk.knnnk.knnnk",
            ".kmk...kmk...kmk.",
            ".kjk...kjk...kjk.",
            "..kjk..kjk..kjk..",
            "...kjkkkjkkkjk...",
            "....kkjjmjjkk....",
            ".......kmk.......",
            ".......kjk.......",
            "......kmnjk......",
            ".......kjk.......",
            ".......kjk.......",
            "......kjmjk......",
            "....kkmnnmjkk....",
            "...kmmmmmmmmjk...",
            "..kkkkkkkkkkkkk.."], 0, 8]]);
    // A wall sconce: an iron plate, an arm out of it, a drip pan with a taper in it. 13 x 16.
    const CANDLE_SCONCE = lay(13, 16, [[waxCandle(5, 7, [[1, 3]]), 6, 0], [[
        "kk...k^~~~&k.",
        "knk..knnnnnk.",
        "kmk.kjmmmmmjk",
        "kmk..kjjjjjk.",
        "kmkkkjjkkk...",
        "knmjjjk......",
        "kmk..........",
        "kjk..........",
        "kk..........."], 0, 7]]);
    // A candle on a skull, its wax run down over the brow. 13 x 14.
    const CANDLE_SKULL = lay(13, 14, [[waxCandle(5, 5, [[1, 2]]), 4, 0], [[
        "..kk^^~~~&kk.",
        ".k^^~^~~~~&k.",
        "k^~^~~~~~~~&k",
        "k~^kkk~kkk~&k",
        "k~k}}k~k}}k&k",
        "k~~kkk&kkk&?k",
        ".k~~~k}k~~&k.",
        "..k~k~k~k&k..",
        "...kkkkkkk..."], 0, 5]]);
    // A candle in a green bottle's neck, its wax run down the glass. 13 x 18.
    const CANDLE_BOTTLE = lay(13, 18, [[waxCandle(5, 4, [[1, 2]]), 4, 0], [[
        "...k^^~~&k...",
        "....k^Vvk....",
        "....k^:vk....",
        "....kV:vk....",
        "...kV:VVvk...",
        "..kV:VVVVvk..",
        ".kV:VVVVVVvk.",
        ".kV:VVVVVVvk.",
        ".kV:VVVVVVvk.",
        ".kV:VVVVVVvk.",
        ".kV:VVVVVVvk.",
        ".kVVVVVVVvvk.",
        ".kVVVVVVvvvk.",
        "..kkkkkkkkk.."], 0, 4]]);
    /* A candle in an iron cup, to hang: a lug at each end of the cup's rim, which the game's chains run from up to a
       ring well over the flame (CANDLES: lugs, apex), and on up to the roof. 13 x 12. */
    const CANDLE_CRADLE = lay(13, 12, [[waxCandle(7, 6, [[1, 3], [5, 2]]), 3, 0], [[
        "n...........n",
        "kmn^~~~~~&nmk",
        ".kjmmmmmmmjk.",
        "..kjjjjjjjk..",
        "...kkjjjkk...",
        ".....kjk.....",
        "......k......"], 0, 5]]);
    // An iron hoop of candles, to hang: four on it, a pixel apart, the middle two the taller; a lug at each end for the game's chains. 33 x 11.
    const CANDLE_RING = lay(33, 11, [
        [waxCandle(5, 5, [[1, 2]]), 5, 2], [waxCandle(5, 7, [[1, 3]]), 11, 0], [waxCandle(5, 7, [[3, 2]]), 17, 0], [waxCandle(5, 5, [[3, 2]]), 23, 2],
        [[
            "n...............................n",
            "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
            "knnmmmmmmmmmmmmmmmmmmmmmmmmmmmmjk",
            "kjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjk",
            ".kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk."], 0, 6]]);
    // A jar of fireflies, corked, a string round its neck; the flies themselves are the game's, blinking. 13 x 16.
    const FIREFLY_JAR = [
        "....kkkkk....",
        "....k9A8k....",
        "....k788k....",
        "...kkkkkkk...",
        "...k(][(]k...",
        "..kc.....qk..",
        ".kc.......qk.",
        "kc.........qk",
        "kc.........qk",
        "kc.........qk",
        "kc.........qk",
        "kc.........qk",
        "kc.........qk",
        "kq.........qk",
        ".kqqqqqqqqqk.",
        "..kkkkkkkkk.."
    ];
    /* The candles' places: the wicks (flames) in each picture, and how it stands (floor: its foot on the floor of its
       tile; wall: on the wall; hang: from chains). A hanging one: lugs, the points its chains run from; apex, the
       ring they meet at (on the object's own x + 8 and y), from which one chain runs on up to the roof. */
    const CANDLES = {
        candle: { spr: "candlePillar", w: 13, h: 13, place: "floor", wicks: [[6, 0]] },
        candleStub: { spr: "candleStub", w: 13, h: 7, place: "floor", wicks: [[6, 0]] },
        candles: { spr: "candleTrio", w: 17, h: 15, place: "floor", wicks: [[4, 0], [13, 4], [8, 7]] },
        candlestick: { spr: "candleTaper", w: 13, h: 15, place: "floor", wicks: [[6, 0]] },
        candelabra: { spr: "candleArms", w: 17, h: 23, place: "floor", wicks: [[2, 2], [8, 0], [14, 2]] },
        sconce: { spr: "candleSconce", w: 13, h: 16, place: "wall", wicks: [[8, 0]] },
        skullCandle: { spr: "candleSkull", w: 13, h: 14, place: "floor", wicks: [[6, 0]] },
        bottleCandle: { spr: "candleBottle", w: 13, h: 18, place: "floor", wicks: [[6, 0]] },
        candleHang: { spr: "candleCradle", w: 13, h: 12, place: "hang", wicks: [[6, 0]], lugs: [[0, 5], [12, 5]], apex: [6, -16] },
        chandelier: { spr: "candleRing", w: 33, h: 11, place: "hang", wicks: [[7, 2], [13, 0], [19, 0], [25, 2]], lugs: [[0, 6], [32, 6]], apex: [16, -28] },
        fireflies: { spr: "fireflyJar", w: 13, h: 16, place: "floor", wicks: [], flies: { x: 3, y: 6, w: 7, h: 7 }, glass: [[4, 5, 5], [3, 6, 7], [2, 7, 9], [2, 8, 9], [2, 9, 9], [2, 10, 9], [2, 11, 9], [2, 12, 9], [2, 13, 9]] }
    };
    // The torch's flame, four frames, 14 x 11, burning on the torch's head.
    const FLAME = [
        [
            "......F.......",
            "......FF......",
            ".....FtF......",
            ".....FtTF.....",
            "....FtTTF.....",
            "....FtTWtF....",
            "...FtTWWTF....",
            "...FtWWWWtF...",
            "...FTWWWWTF...",
            "...FtTWWTtF...",
            "....FtTTtF...."
        ],
        [
            ".......F......",
            ".......FF.....",
            "......FtF.....",
            ".....FtTF.....",
            ".....FtTTF....",
            "....FtTWtF....",
            "....FtWWTF....",
            "...FtTWWWtF...",
            "...FTWWWWTF...",
            "...FtWWWWtF...",
            "....FTttTF...."
        ],
        [
            ".....F........",
            ".....FF.......",
            ".....FtF......",
            "....FtTF......",
            "....FtTTF.....",
            "...FtTWTF.....",
            "...FtWWTtF....",
            "...FtWWWWtF...",
            "...FTWWWWTF...",
            "...FtTWWTtF...",
            "....FtTTtF...."
        ],
        [
            "..............",
            "......F.......",
            "......tF......",
            ".....FtTF.....",
            ".....FtTF.....",
            "....FtTWtF....",
            "....FTWWTF....",
            "...FtWWWWtF...",
            "...FTWWWWTF...",
            "...FtWWWWtF...",
            "....FTttTF...."
        ]
    ];

    // A crate: a frame of planks, a cross-brace, iron corners, nails.
    const CRATE = [
        "kkkkkkkkkkkkkkkk",
        "kmCCCCCCCCCCCCmk",
        "kCDDDDDDDDDDDDAk",
        "kCA9999999999A7k",
        "kCA8AC888888A97k",
        "kCA88AC8888A897k",
        "kCA888AC88A8897k",
        "kCA8888ACA88897k",
        "kCA8888AAC88897k",
        "kCA888A88AC8897k",
        "kCA88A8888AC897k",
        "kCA8A888888AC97k",
        "kCA9999999999A7k",
        "kCAAAAAAAAAAAA7k",
        "km777777777777mk",
        "kkkkkkkkkkkkkkkk"
    ];

    /* THE CRATE SCOUT PUSHES (16 Oct 2026, the owner's: "slightly adjust our
       pushable crate design as there is a scenery item that looks exactly
       the same"). The same build, but fresh timber, a cross brace rather
       than one diagonal, and an iron bracket riveted over each corner: a
       crate made to be moved. The props keep CRATE. */
    const PUSH_CRATE = [
        "kkkkkkkkkkkkkkkk",
        "kmmnCCCCCCCCnmmk",
        "kmjjDDDDDDDDjjik",
        "knjA99999999Aj7k",
        "kCAAC999999CA97k",
        "kCA9AC9999CA997k",
        "kCA99AC99CA9997k",
        "kCA999ACCA99997k",
        "kCA999ACCA99997k",
        "kCA99AC99CA9997k",
        "kCA9AC9999CA997k",
        "kCAAC999999CA97k",
        "knjA99999999Aj7k",
        "kmjjAAAAAAAAjjik",
        "kmmn77777777nmik",
        "kkkkkkkkkkkkkkkk"
    ];
    /* THE KNIFE (16 Oct 2026, the owner's: to cut a hanging crate's rope;
       redrawn the same day, "looks more like a short sword"): a work knife,
       point up. A short broad blade, its spine straight down the left and its
       edge bellied out on the right, bright where it is sharp; no guard, only
       an iron bolster; a slim wooden handle with two brass rivets. Picked up,
       and in the satchel. */
    const KNIFE = [
        "..k.....",
        "..knk...",
        "..kmnk..",
        "..kmnk..",
        "..kmmnk.",
        "..kmmnk.",
        "..kmmnk.",
        "..kmmmnk",
        "..kjmmnk",
        "..kjjik.",
        "..kDCAk.",
        "..kC5Ak.",
        "..kDCAk.",
        "..kDCAk.",
        "..kC5Ak.",
        "...kkk.."
    ];

    // Spikes: a row of four iron spikes on a plate, lit on their left faces.
    const SPIKES = [
        "..k...k...k...k.",
        ".knk.knk.knk.knk",
        ".knk.knk.knk.knk",
        "knmjknmjknmjknmj",
        "knmjknmjknmjknmj",
        "nmjjnmjjnmjjnmjk",
        "kjjjjjjjjjjjjjjk",
        "kiiiiiiiiiiiiiik"
    ];

    /* ---------------------------------------------------------------- MORE OF SCOUT */
    const BACK = [
        "................",
        "......kkkkk.....",
        ".....kHHHHHk....",
        ".....kHHHHHhk...",
        "....kbbbbbbbk...",
        "..kkHHHHHHHHhkk.",
        ".khhhhhhhhhhhhhk",
        "..kkkkkkkkkkkkk.",
        "....krrrrrrrk...",
        "....krrrrrrrk...",
        "....krrrrrrrk...",
        "....kkrrrrrkk...",
        ".....kkSSSkk...."
    ];
    const climbA = [
        "..ksk.kOOOOOk...",
        "..kOkkOOgOOOOk..",
        "...kOOOOgOOOOk..",
        "....kOOOOOgOOsk.",
        "....kkggggggkk..",
        "....kYYYYYYYk...",
        "....kYYukkYYk...",
        "....kSSk.kSSk...",
        "....kBBk.kBBk...",
        "...kBBBk.kkkk...",
        "...kkkkk........"
    ];
    const climbB = [
        "....kOOOOOk.ksk.",
        "...kOOOOgOOkkOk.",
        "...kOOOOgOOOOk..",
        "..ksOOgOOOOOk...",
        "...kkggggggkk...",
        "....kYYYYYYYk...",
        "....kYYkkuYYk...",
        "....kSSk.kSSk...",
        "....kBBk.kBBk...",
        "....kkkk.kBBBk..",
        "........kkkkk..."
    ];
    // Crouched: the same head, lower, the body folded.
    const BLANK = "................";
    const crouch = [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK].concat(HEAD.slice(1), [
        "...kOOOOgOOOOk..",
        "..ksOOOOOgOOOsk.",
        "..kkYYYYYYYYYkk.",
        ".kBBkSSSSSSkBBk.",
        ".kkkkkkkkkkkkkk."
    ]);
    /* CRAWLING AND SWIMMING (redrawn 21 Oct 2026, the owner's: "swimming and crawling sprites also look weird to
       me, improve them to the highest possible quality"): 16 tall, the height of a one-tile tunnel (his hat just
       under its roof), with his own head as he stands, hat, hair and face, not a smaller one. Four frames each.
       The crawl, 26 wide: on hands and knees, the back flat and low behind his head, a diagonal gait (the near
       arm with the far leg), each limb planted forward, then back, then lifted and brought through; the boots'
       soles turned up behind. The swim, 30 wide: flat out, a front crawl, the near arm reaching out under his chin,
       pulling down and back under him to the hip, then lifted over his back; the far arm half a stroke behind it;
       a flutter kick. The near limbs bright, the far ones in shade, each outlined against the other. */
    const crawl0 = [
        "................kkkkk.....",
        "...............kLLHHHk....",
        "...............kLHHHHhk...",
        "..............kbbbbbbbk...",
        "............kkHHHHHHHHhkk.",
        "...........khhhhhhhhhhhhhk",
        "............kkkkkkkkkkkkk.",
        "....kkkkkkkkkkkrrssssssk..",
        "...kYYYgOlllgOkrrsssssesk.",
        "...kYYYyOOggOOkrsssssssSk.",
        "...kYYYgggOOOkkkrssssSSkk.",
        ".kkkuuugooookOkkkSSSSkk...",
        "kYYkkkkkkkkkkkssk.........",
        "BsskkkkkSSk.kSkssk........",
        "BsskddSSSSSkkSksssk.......",
        "kkk.kkkkkkk..kkkkk........"
    ];
    const crawl1 = [
        "................kkkkk.....",
        "...............kLLHHHk....",
        "...............kLHHHHhk...",
        "..............kbbbbbbbk...",
        "............kkHHHHHHHHhkk.",
        "...........khhhhhhhhhhhhhk",
        "............kkkkkkkkkkkkk.",
        "....kkkkkkkkkkkrrssssssk..",
        "...kYYYgOlllgOkrrsssssesk.",
        "...kYYYyOOggOOkrsssssssSk.",
        "...kYYYgggOOOkkkrssssSSkk.",
        ".k.kkkugooookOkkkSSSSkk...",
        "kBkkYYkkkkkkkskSSSk.......",
        "kBsssskk....ksskkk........",
        ".kkkkkSSk....ksssk........",
        "...kkkkk......kkk........."
    ];
    const crawl2 = [
        "................kkkkk.....",
        "...............kLLHHHk....",
        "...............kLHHHHhk...",
        "..............kbbbbbbbk...",
        "............kkHHHHHHHHhkk.",
        "...........khhhhhhhhhhhhhk",
        "............kkkkkkkkkkkkk.",
        "....kkkkkkkkkkkrrssssssk..",
        "...kYYYgOlllgOkrrsssssesk.",
        "...kYYYyOOggOOkrsssssssSk.",
        "...kYYYgggOOkOkkrssssSSkk.",
        "...kuukkoookOkkkkSSSSkk...",
        "..kukkYYkkkkSkkSSk........",
        ".kkkkkssk..ksk.kSSk.......",
        ".kBBsssssk.ksskkSSSk......",
        "..kkkkkkk...kk..kkk......."
    ];
    const crawl3 = [
        "................kkkkk.....",
        "...............kLLHHHk....",
        "...............kLHHHHhk...",
        "..............kbbbbbbbk...",
        "............kkHHHHHHHHhkk.",
        "...........khhhhhhhhhhhhhk",
        "............kkkkkkkkkkkkk.",
        "....kkkkkkkkkkkrrssssssk..",
        "...kYYYgOlllgOkrrsssssesk.",
        "...kYYYyOOggOOkrsssssssSk.",
        "...kYYYgggOOOkkkrssssSSkk.",
        "...kkuugooookOsskSSSSkk...",
        "..kYYkkkkkkkkksssk........",
        ".kksskSSk....kkkkk........",
        "kBBssskk......kSSSk.......",
        ".kkkkk.........kkk........"
    ];
    /* THE CRAWL AND THE SWIM, AGAIN (23 Oct 2026, the owner's: "Improve the crawl and swimming sprites too, they look
       awful"). Put together from parts rather than typed whole, so each limb is a clean shape of its own: his head as
       he stands (hat, hair, face), a body, and an arm and a leg, the near ones bright, the far ones in shade, each
       outlined, set where the frame has them. Drawn in order: far limbs, body, near limbs, head. */
    const pgrid = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
    const pstamp = (g, rows, ox, oy) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== "." && g[oy + j] && ox + i >= 0 && ox + i < g[oy + j].length) g[oy + j][ox + i] = r[i]; });
    const compose = (w, h, parts) => { const g = pgrid(w, h); for (const [rows, x, y] of parts) pstamp(g, rows, x, y); return g.map(r => r.join("")); };
    const HEAD12 = HEAD.slice(1, 13);
    // the crawl: on hands and knees, his back level, his hands under his chin and his knees under his hips
    const CR_BODY = ["...kkkkkkkkk", "..kYYkOOlllO", ".kYYYgOOOOgO", ".kuYYyOOOOOg", "..kuuggoooOo", "...kkkkkkkkk"];
    const CR_BODY_W = ["...kkkkkkkkkkkk", "..kYYkOOlllOOOO", ".kYYYgOOOOgOOOO", ".kuYYyOOOOOgOOO", "..kuuggooooooOo", "...kkkkkkkkkkkk"];
    const CR_ARM = ["kOOk", ".ksk", ".ksk", "kssk", "kkkk"], CR_ARM_FAR = ["kook", ".kSk", ".kSk", "kSSk", "kkkk"];
    const CR_LEG = [".....kYYk", ".....kYuk", "kkkkkkSSk", "kBBsssSSk", "kkkkkkkkk"], CR_LEG_FAR = [".....kuuk", ".....kuuk", "kkkkkkSSk", "kddSSSSSk", "kkkkkkkkk"];
    // [near arm x, far arm x, near leg x, far leg x]: a diagonal gait, the near arm going with the far leg
    // (30 wide: his hat's brim is fifteen pixels across, so the room behind it for his back, his knees under his hips, his shins along the floor behind)
    const CR_STEPS = [[19, 16, 0, 2], [18, 17, 1, 1], [16, 19, 2, 0], [17, 18, 1, 1]];
    const CRAWL = CR_STEPS.map(([na, fa, nl, fl]) => compose(30, 16, [[CR_LEG_FAR, fl, 11], [CR_ARM_FAR, fa, 11], [CR_BODY_W, 5, 6], [CR_LEG, nl, 11], [CR_ARM, na, 11], [HEAD12, 14, 0]]));
    // the swim: flat out, a front crawl; the near arm reaching ahead under his chin, pulling down, back to his hip, over
    // his back; the far arm half a stroke behind; a flutter kick
    const SW_BODY = ["....kkkkkkkkkkkk", "..kkYYkOOlllOOOO", ".kYYYYgOOOOgOOOO", ".kuuYYyOOOOOgOOO", "..kkuuggoooooOoo", "....kkkkkkkkkkkk"];
    const SW_LEG_UP = ["kkkk.....", "kBBkkkkkk", "kBBsssYYk", "kkkkkkkkk"], SW_LEG_DOWN = ["kkkkkkkkk", "kddSSSuuk", "kddkkkkkk", "kkkk....."];
    const SW_ARM = {
        ahead: ["kkkkkkkkkkkkk", "kOssssssssssk", "kkkkkkkkkkksk", "...........kk"],
        down: ["kOOk", "kssk", ".ksk", ".ksk", ".kkk"],
        back: ["kkkkkkkkkk", "ksssssssOk", "kkkkkkkkkk"],
        over: ["....kkkkkkk", "...ksssssssk", "..kssk.kkkk.", ".kOOk......."]
    };
    const farArm = rows => rows.map(r => r.replace(/s/g, "S").replace(/O/g, "o"));
    // [near arm stroke, far arm stroke, which leg up]
    const SW_STEPS = [["ahead", "back", 0], ["down", "over", 1], ["back", "ahead", 0], ["over", "down", 1]];
    const SW_AT = { ahead: [16, 11], down: [16, 11], back: [7, 11], over: [9, 2] };
    const SWIM = SW_STEPS.map(([na, fa, up]) => compose(30, 16, [
        [farArm(SW_ARM[fa]), SW_AT[fa][0] - 1, SW_AT[fa][1]],
        [up ? SW_LEG_DOWN : SW_LEG_UP, 0, up ? 9 : 7], [SW_BODY, 3, 6], [up ? SW_LEG_UP : SW_LEG_DOWN, 0, up ? 7 : 9],
        [SW_ARM[na], SW_AT[na][0], SW_AT[na][1]], [HEAD12, 14, 0]
    ]));
    const swim0 = [
        "...................kkkkk......",
        "..................kLLHHHk.....",
        "..................kLHHHHhk....",
        ".................kbbbbbbbk....",
        "...............kkHHHHHHHHhkk..",
        "kk............khhhhhhhhhhhhhk.",
        "BBkk...........kkkkkkkkkkkkk..",
        "BBsskkkkkkkkkkkkkkrrssssssk...",
        "kkssYYkkYgOllllgOkrrsssssesk..",
        "..kkYYYYkyOOOggOOkrsssssssSk..",
        "...kkkkkYgOggOOOOkkrssssSSkk..",
        ".kkSkuuuugooooookkkkkkkkkkkk..",
        "kddSSkkkkkkkkkkkOsssssssssssk.",
        "kddkkkSSSSSSSSSSkkkkkkkkkkkSk.",
        ".kk..kSSkkkkkkkkkk.........k..",
        "......kk......................"
    ];
    const swim1 = [
        "...................kkkkk......",
        "..................kLLHHHk.....",
        "..................kLHHHHhk....",
        ".................kbbbbbbbk....",
        ".........kkkk..kkHHHHHHHHhkk..",
        "........kSSSSkkhhhhhhhhhhhhhk.",
        ".........kkSSSokkkkkkkkkkkkk..",
        "kkkkkkkkkkkkkkkkkkrrssssssk...",
        "BBsssYYYkgOllllgOkrrsssssesk..",
        "BBSSSuuukyOOOggOOkrsssssssSk..",
        "kkkkkkkkYgOggOOOkkkrssssSSkk..",
        ".kkkkuuuugoooookOskkSSSSkk....",
        ".....kkkkkkkkkkkkssk..........",
        ".................kssk.........",
        ".................kSSk.........",
        "..................kk.........."
    ];
    const swim2 = [
        "...................kkkkk......",
        "..................kLLHHHk.....",
        "..................kLHHHHhk....",
        ".................kbbbbbbbk....",
        "...............kkHHHHHHHHhkk..",
        "..............khhhhhhhhhhhhhk.",
        ".kk............kkkkkkkkkkkkk..",
        "kddkkkkkkkkkkkkkkkrrssssssk...",
        "kddSkkkkYgOllllgOkrrsssssesk..",
        ".kkkYYYYkyOOOggOOkrsssssssSk..",
        "kkssYYkkYgOggOOOOkkrssssSSkk..",
        "BBsskkkkkkkkkkkkkkkkSSSSkk....",
        "BBkk.ksssssssssssOkkkkkkkkkkk.",
        "kk...kSSkkkkkkkkkkSSSSSSSSSSSk",
        "......kk.........kkkkkkkkkkkSk",
        "............................k."
    ];
    const swim3 = [
        "...................kkkkk......",
        "..................kLLHHHk.....",
        "..................kLHHHHhk....",
        ".................kbbbbbbbk....",
        ".........kkkk..kkHHHHHHHHhkk..",
        "........ksssskkkhhhhhhhhhhhhk.",
        ".........kkSssOOkkkkkkkkkkkk..",
        "kkkkkkkkkkkkkkkkkkrrssssssk...",
        "BBsssYYYkgOllllgOkrrsssssesk..",
        "BBSSSuuukyOOOggOOkrsssssssSk..",
        "kkkkkkkkYgOggOOOOkkrssssSSkk..",
        ".kkkkuuuugoooooooOkkSSSSkk....",
        ".....kkkkkkkkkkkkkk...........",
        "................kSSk..........",
        ".................kSSk.........",
        ".................kSSk........."
    ];
    /* MANTLING (22 Oct 2026): hauling himself up over a ledge's edge, elbows bent, his hands planted on it at his
       chest (row 14), a knee coming up. */
    const MANTLE_HAUL = HEAD.concat([
        "....kOOlllOOkkk.",
        "...kOOOOgOOOkssk",
        "...kOlOOOgOOOkk.",
        "...kOlOOOOgOk...",
        "...kkkggggyk....",
        "....kYYYYYYk....",
        "....kYYukYYYYk..",
        "....kSSk.kkSSSk.",
        "....kBBk...kBBk.",
        "...kBBBk..kBBBk.",
        "...kkkkk..kkkkk."
    ]);
    // Against a wall, sliding: the hand flat on it, a knee up.
    const wallSlide = [
        "....kOOlllOOkksk",
        "...kOOOOgOOOOkOk",
        "...kOlOOOgOOOOk.",
        "...ksOOOOOgOOk..",
        "...kkkggggyggk..",
        "....kYYYYYYYYk..",
        "....kYYukYYYk...",
        "....kSSk.kSSk...",
        "....kBBk.kBBk...",
        "...kBBBk.kBBBk..",
        "...kkkkk..kkkk.."
    ];
    // Pushing: leaning in, both hands on the crate, the back leg braced.
    const pushA = [
        "....kOOlllOk....",
        "...kOOOOgOOOkkk.",
        "...kOlOOOgOOOOsk",
        "...kOlOOOOgOOOsk",
        "...kkkggggyggkk.",
        "...kYYYYYYYYk...",
        "..kYYuk.kYYk....",
        ".kSSk...kSSk....",
        "kBBk....kBBk....",
        "kBBBk..kBBBk....",
        "kkkkk..kkkkk...."
    ];
    const pushB = [
        "....kOOlllOk....",
        "...kOOOOgOOOkkk.",
        "...kOlOOOgOOOOsk",
        "...kOlOOOOgOOOsk",
        "...kkkggggyggkk.",
        "...kYYYYYYYYk...",
        "...kYYkkYYuk....",
        "..kSSk..kSSk....",
        ".kBBk...kBBk....",
        ".kBBBk.kBBBk....",
        ".kkkkk.kkkkk...."
    ];
    // Hit: knocked back, arms flung, eyes squeezed shut.
    const HURT_HEAD = HEAD.slice(0, 9).concat(["....krrsssskSk..", "....krssssskSk..", "....kkrssssSSkk."], HEAD.slice(12));
    const hurt = [
        ".ks.kOOlllOOk.sk",
        ".kOkOOOOgOOOOkOk",
        "..kkOlOOOgOOOOk.",
        "....kOOOOOgOOk..",
        "....kkggggyggk..",
        "....kYYYYYYYYk..",
        "...kYYukkkuYYk..",
        "..kSSk....kSSk..",
        ".kBBk......kBBk.",
        ".kBBBk....kBBBk.",
        ".kkkkk....kkkkk."
    ];
    // The act cleared: hat raised high.
    // Hat off, held up high in the front hand; his hair out at last.
    const CHEER_HEAD = [
        "..........kkkk..",
        ".........kLHHHk.",
        "........kbbbbbbk",
        ".......khhhhhhhk",
        "........kkksskk.",
        "......kkkk.kOk..",
        ".....krrrrk.kOk.",
        "....krrrrrrkkOk.",
        "....krrssssskOk.",
        "....krrsssseskk.",
        "....krsssssssSk.",
        "....kkrssssSSkk.",
        ".....kkSSSSkk..."
    ];
    const cheer = [
        "....kOOlllOOkk..",
        "...kOOOOgOOOOk..",
        "...kOlOOOgOOOk..",
        "...ksOOOOOgOk...",
        "...kkkggggyk....",
        "....kYYYYYYYYk..",
        "....kYYukkuYYk..",
        "....kSSk..kSSk..",
        "....kBBk..kBBk..",
        "...kBBBk..kBBBk.",
        "...kkkkk..kkkkk."
    ];

    /* ---------------------------------------------------------------- CREATURES */
    // The maze rat: grey, pink ears and nose and tail, scurrying. 20 x 11.
    const RAT = [
        [
            "...............kk...",
            "..............kppk..",
            "......kkkkkk.kpPGk..",
            "....kkGGGGGGkkGGGGk.",
            "...kGGGGGGGGGGGGekGk",
            "pk.kGGGGGGGGGGGGGGGp",
            ".pkRGGGGGGGGGGGGGkk.",
            "..pkRRGGGGGGGGRRk...",
            "...kkRRRRRRRRRkk....",
            "....kRk.kk..kRk.....",
            "....kk.......kk....."
        ],
        [
            "...............kk...",
            "..............kppk..",
            "......kkkkkk.kpPGk..",
            "....kkGGGGGGkkGGGGk.",
            "...kGGGGGGGGGGGGekGk",
            "...kGGGGGGGGGGGGGGGp",
            "pkkRGGGGGGGGGGGGGkk.",
            ".pkkRRGGGGGGGGRRk...",
            "..p.kkRRRRRRRRkk....",
            ".....kRkk..kRk......",
            "......kk....kk......"
        ]
    ];
    // The bat: wings up, wings down. 18 x 10.
    const BAT = [
        [
            "k................k",
            "=k......kk......k=",
            "==k....k++k....k==",
            "+==k..k+*+*k..k==+",
            ".+==kk++++++kk==+.",
            "..+===++++++===+..",
            "...k+=++++++=+k...",
            ".....kk+kk+kk.....",
            "........kk........",
            ".................."
        ],
        [
            "..................",
            "........kk........",
            ".......k++k.......",
            "......k+*+*k......",
            "...kkk++++++kkk...",
            "..k===++++++===k..",
            ".k==+=+++++==+==k.",
            "k==+.kk+kk+k.+==k.",
            "k=+.....kk....+=k.",
            "kk..............kk"
        ]
    ];
    // The spider, on its thread (the thread is drawn by the game). 14 x 11.
    const SPIDER = [
        [
            "......kk......",
            "..k...kk...k..",
            ".k.k.kiik.k.k.",
            "k...kiiiik...k",
            "..kkiiiiiikk..",
            ".k.kiijjiik.k.",
            "k..ki*ii*ik..k",
            "..k.kiiiik.k..",
            ".k...kiik...k.",
            "k.....kk.....k",
            ".............."
        ],
        [
            "......kk......",
            "...k..kk..k...",
            "..k.kkiikk.k..",
            ".k..kiiiik..k.",
            "k.kkiiiiiikk.k",
            "..kkiijjiikk..",
            ".k.ki*ii*ik.k.",
            "k..k.kiik.k..k",
            "..k..kiik..k..",
            ".k....kk....k.",
            ".............."
        ]
    ];

    /* ---------------------------------------------------------------- PICKUPS */
    // A ruby, cut: the secret rooms' prize. 11 x 10.
    const GEM = [
        "..kkkkkkk..",
        ".k%$$@$$@k.",
        "k%%$@@$@@@k",
        "kkkkkkkkkkk",
        "k$%$@@$@@!k",
        ".k$$@@@@!k.",
        "..k$@@@!k..",
        "...k$@!k...",
        "....k@k....",
        ".....k....."
    ];
    // An extra life: Scout's hat. 16 x 10.
    const HAT = [
        "......kkkkk.....",
        ".....kLLHHHk....",
        ".....kLHHHHhk...",
        "....kbbbbbbbk...",
        "..kkHHHHHHHHhkk.",
        ".khhhhhhhhhhhhhk",
        "..kkkkkkkkkkkkk.",
        "................",
        "................",
        "................"
    ].slice(0, 7);

    /* ---------------------------------------------------------------- THE PLACE */
    // Inside a wall: long boards, two to a tile, with grain. Three versions,
    // picked tile by tile: mostly none has a joint, so the boards run on; where
    // two boards butt together, a nail either side.
    const PLANKS = [
        [
            "9999999999999999",
            "8888888888888888",
            "8878888888877788",
            "8888888888888888",
            "8888877778888888",
            "8888888888888888",
            "7777777777777777",
            "6666666666666666",
            "9999999999999999",
            "8888888888888888",
            "8888888778888888",
            "8877788888888888",
            "8888888888888878",
            "8888888888888888",
            "7777777777777777",
            "6666666666666666"
        ],
        [
            "9999999999999999",
            "8888888888888888",
            "8888888888888888",
            "8877788888887888",
            "8888888888888888",
            "8888888777888888",
            "7777777777777777",
            "6666666666666666",
            "9999999999699999",
            "8888888888688888",
            "888888888m6m8888",
            "8877788888688888",
            "8888888888688878",
            "8888888888688888",
            "7777777777677777",
            "6666666666666666"
        ],
        [
            "9999699999999999",
            "8888688888888888",
            "888m6m8888877888",
            "8888688888888888",
            "8778688888888888",
            "8888688877788888",
            "7777677777777777",
            "6666666666666666",
            "9999999999999999",
            "8888888888888888",
            "8888877788888888",
            "8888888888888888",
            "8878888888887778",
            "8888888888888888",
            "7777777777777777",
            "6666666666666666"
        ]
    ];
    // The lit lip along a wall's top edge, laid over the planks.
    const LIP = [
        "kkkkkkkkkkkkkkkk",
        "DDDDDDDDDDDDDDDD",
        "CCCCCDCCCCCCCDCC",
        "AAAAAAAAAAAAAAAA",
        "7777777777777777"
    ];
    // A beam you can jump up through and stand on.
    const BEAM = [
        "kkkkkkkkkkkkkkkk",
        "CDDDDDDDCDDDDDDD",
        "ACCCCCCCACCCCCCC",
        "9AAAAAAA9AAAAAAA",
        "8999999989999999",
        "7777777777777777",
        "kkkkkkkkkkkkkkkk"
    ];
    const LADDER = [
        ".kCAk......kCAk.",
        ".kCAk......kCAk.",
        ".kCAkkkkkkkkCAk.",
        ".kCADDDDDDDDCAk.",
        ".kCA99999999CAk.",
        ".kCAkkkkkkkkCAk.",
        ".kCAk......kCAk.",
        ".kCAk......kCAk.",
        ".kCAk......kCAk.",
        ".kCAk......kCAk.",
        ".kCAkkkkkkkkCAk.",
        ".kCADDDDDDDDCAk.",
        ".kCA99999999CAk.",
        ".kCAkkkkkkkkCAk.",
        ".kCAk......kCAk.",
        ".kCAk......kCAk."
    ];
    /* THE WEATHERED LADDER and THE BROKEN ONE (21 Oct 2026, the owner's: "Make a weather version of the Ladder,
       and a version where the bottom is broken - both still using the same mechanics as the normal Ladder").
       Weathered: the same build, its timber gone grey-brown with years of damp (its own colours, < > { }), a dark
       split here and there down a rail, a knot, a rung worn hollow in the middle; the second picture, for some of
       its tiles, has a rung split clean through, its two halves still nailed to the rails. Broken: the ladder as it
       is, only its lowest tile snapped off: the left rail broken short in splinters, the right one a little longer,
       its last rung gone (21 Oct 2026: the rung that lay fallen at its foot taken away, the owner's: "a strange bit at the bottom"). */
    const LADDER_OLD = [
        ".k<>k......k<>k.",
        ".k<}k......k<>k.",
        ".k<>kkkkkkkk<>k.",
        ".k<><<><<<<<<>k.",
        ".k<>>>}>>}>><>k.",
        ".k<>kkkkkkkk<}k.",
        ".k<>k......k<>k.",
        ".k>>k......k<>k.",
        ".k<>k......k<>k.",
        ".k<}k......k<>k.",
        ".k<>kkkkkkkk<>k.",
        ".k<><<<kk<<<<>k.",
        ".k<>>>}>>}>><>k.",
        ".k<>kkkkkkkk<>k.",
        ".k<>k......k>>k.",
        ".k<>k......k<>k."
    ];
    const LADDER_OLD_SPLIT = [
        ".k<>k......k<>k.",
        ".k<>k......k<}k.",
        ".k<>kkkkkkkk<>k.",
        ".k<><<<<<<<<<>k.",
        ".k<>>}>>>>}><>k.",
        ".k<}kkkkkkkk<>k.",
        ".k<>k......k<>k.",
        ".k<>k......k>>k.",
        ".k>>k......k<>k.",
        ".k<>k......k<>k.",
        ".k<>kkkk...k<>k.",
        ".k<><<<>k.kk<>k.",
        ".k<>>}>>kk<<<>k.",
        ".k<>kkkk.k}><}k.",
        ".k<>k.....kkk>k.",
        ".k<}k......k<>k."
    ];
    const LADDER_BROKEN = [
        ".kCAk......kCAk.",
        ".kCAk......kCAk.",
        ".kCAkkkkkkkkCAk.",
        ".kCADDDDDDDDCAk.",
        ".kCA99999999CAk.",
        ".kCAkkkkkkkkCAk.",
        ".kCkk......kCAk.",
        ".kkAk......kCAk.",
        "..kk.......kCkk.",
        "...........kkAk.",
        "............kk..",
        "................",
        "................",
        "................",
        "................",
        "................"
    ];
    /* THE ROPE (13 Oct 2026, drawn again: "you can make it 100x better"). Three
       strands laid on the diagonal, each lit along its ridge, a dark groove
       between them, the whole rounded by the light from the left; the twist
       repeats every four rows, so it runs on seamlessly however long. Where
       it is tied: an iron eye-bolt in the roof and a knot through it. Where
       it ends in the air: whipped with twine, then frayed. 16 x 16 each,
       made in the scratchpad's ratrace/rope-gen.js. */
    const ROPE = [
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k.....",
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k.....",
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k.....",
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k....."
    ];
    const ROPE_TOP = [
        "kkkkkkkkkkkkkkkk",
        "....kkijjikk....",
        ".....kjmmjk.....",
        "......knnk......",
        ".....kn..nk.....",
        ".....km..mk.....",
        "......kmmk......",
        ".....k(()[k.....",
        "....k(()[[]k....",
        "....k)(][[]k....",
        ".....k)[[]k.....",
        ".....k(]()k.....",
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k....."
    ];
    const ROPE_END = [
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k.....",
        ".....k[(([k.....",
        ".....k(()]k.....",
        ".....k()])k.....",
        ".....k(]()k.....",
        ".....k][][k.....",
        ".....k[][]k.....",
        ".....k(()[k.....",
        "......()[)......",
        ".....(.)[.).....",
        "....(..)..[)....",
        "....(......[....",
        "................"
    ];

    /* The way out: an arched door of oak, iron-banded and studded, set in a
       stone arch. 32 x 48. Locked, a padlock hangs on its ring. */
    const DOOR = [
        "..........kkkkkkkkkkkk..........",
        ".......kkkKKMMNNMMKKKKkkk.......",
        ".....kkKKMMNkkkkkkkkNMMKKkk.....",
        "....kKKMNkk7777777777kkNMKKk....",
        "...kKKMkk77888888888877kkMKKk...",
        "..kKKMk7788889988998888877kMKKk.",
        "..kKMk788899988899988999887kMKk.",
        ".kKKk7889998889998889998889kKKk.",
        ".kKMk7899988899988899988898kMKk.",
        ".kKMk7899988899988899988898kMKk.",
        "kKKMkjjjjjjjjjjjjjjjjjjjjjjkMKKk",
        "kKMNkmnmmmnmmmmnmmmmnmmmnmmkNMKk",
        "kKMMkjjjjjjjjjjjjjjjjjjjjjjkMMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMk7899988899988899988898kMKEk",
        "kKKMk7899988899988899988898kMKKk",
        "kKMNk7899988899988899988898kNMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMk7899988899988899988898kMKEk",
        "kKKMk7899988899988899988898kMKKk",
        "kKMNk7899988899988899988898kNMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMk7899988899988899988898kMKEk",
        "kKKMk7899988899988899988898kMKKk",
        "kKMNk78999888999kk899988898kNMKk",
        "kKKMk7899988899kjjk99988898kMKKk",
        "kEKMk7899988899kjjk99988898kMKEk",
        "kKKMk78999888999kk899988898kMKKk",
        "kKMNk78999888999kk899988898kNMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMkjjjjjjjjjjjjjjjjjjjjjjkMKEk",
        "kKKMkmnmmmnmmmmnmmmmnmmmnmmkMKKk",
        "kKMNkjjjjjjjjjjjjjjjjjjjjjjkNMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMk7899988899988899988898kMKEk",
        "kKKMk7899988899988899988898kMKKk",
        "kKMNk7899988899988899988898kNMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMk7899988899988899988898kMKEk",
        "kKKMk7899988899988899988898kMKKk",
        "kKMNk7899988899988899988898kNMKk",
        "kKKMk7899988899988899988898kMKKk",
        "kEKMk7899988899988899988898kMKEk",
        "kKKMk7899988899988899988898kMKKk",
        "kKMNk7777777777777777777777kNMKk",
        "kKKMkkkkkkkkkkkkkkkkkkkkkkkkMKKk",
        "kEEEKKKKKKKKKKKKKKKKKKKKKKKKEEEk",
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"
    ];
    // The padlock that hangs on the locked door. 10 x 12.
    const PADLOCK = [
        "...kkkk...",
        "..kmnnmk..",
        ".kmk..kmk.",
        ".kmk..kmk.",
        "kkkkkkkkkk",
        "k45555543k",
        "k4433k334k",
        "k443kk234k",
        "k4433k334k",
        "k33322233k",
        "k22222222k",
        "kkkkkkkkkk"
    ];
    /* The door standing open (13 Oct 2026): nothing to see inside but light,
       white-hot, too bright to look into; the game pours its glow out over
       the room (doorLight in js/rat-race.js). */
    const DOOR_OPEN = DOOR.map((row, y) => {
        if (y < 3 || y > 44) return row;
        return row.replace(/k([^k]*?)k(.*)k([^k]*?)k$/, (m, a, mid, b) => "k" + a + "k" + mid.replace(/./g, "w") + "k" + b + "k");
    });

    // Cobweb, for a corner. 16 x 16.
    const WEB = [
        "cqcqcqcqcqcqcqcq",
        "q..c...q...c..q.",
        "c...c..q..c..q..",
        "q....cqcqc..q...",
        "c...q..q..cq....",
        "q..c...q..q.....",
        "c.q...cqcq......",
        "qc...q..q.......",
        "c...c..q........",
        "q..qcqc.........",
        "c.q..q..........",
        "qc..q...........",
        "c..q............",
        "q.q.............",
        "cq..............",
        "q..............."
    ];
    // A banner of red cloth on a pole, a gold labyrinth stitched on it. 16 x 28.
    const BANNER = [
        "kkkkkkkkkkkkkkkk",
        "knmmmmmmmmmmmmjk",
        "kkkkkkkkkkkkkkkk",
        ".kxXXXXXXXXXXxk.",
        ".kxX444X4444Xxk.",
        ".kxX4XXX4XX4Xxk.",
        ".kxX4X444X44Xxk.",
        ".kxX4X4XXXX4Xxk.",
        ".kxX4X4X44X4Xxk.",
        ".kxX4XXX4XX4Xxk.",
        ".kxX444X4X44Xxk.",
        ".kxX4XXX4XX4Xxk.",
        ".kxX4X4XXX44Xxk.",
        ".kxX4444X444Xxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXXXXXXXxk.",
        ".kxXXXXkkXXXXxk.",
        ".kxXXXk..kXXXxk.",
        ".kxXXk....kXXxk.",
        ".kxXk......kXxk.",
        ".kxk........kxk.",
        ".kk..........kk.",
        "................",
        "................",
        "................",
        "................"
    ].slice(0, 28);

    /* The back wall, behind everything: upright boards in shadow, two to a
       tile, a dark gap between them, the odd joint and grain. (The posts,
       rails and braces in front of it are drawn by the game, act by act.) */
    const BACKWALL = [
        [
            "0JUUUUUI0JUUUUUI",
            "0JUUJUUI0JUUUUUI",
            "0JUUJUUI0JUUUIUI",
            "0JUUJUUI0JUUUIUI",
            "0JUUUUUI0JUUUIUI",
            "0JUUUUUI0JUUUUUI",
            "0JIUUUUI0JUUUUUI",
            "0JIUUUUI0JUUUUUI",
            "0JIUUUUI0JUJUUUI",
            "0JUUUUUI0JUJUUUI",
            "0IIIIIII0JUJUUUI",
            "0JJJJJJI0JUUUUUI",
            "0JUUUJUI0JUUUUUI",
            "0JUUUJUI0JUUUUUI",
            "0JUUUJUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI"
        ],
        [
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JUUJUUI",
            "0JUUUIUI0JUUJUUI",
            "0JUUUIUI0JUUUUUI",
            "0JUUUIUI0IIIIIII",
            "0JUUUUUI0JJJJJJI",
            "0JUUUUUI0JUUUUUI",
            "0JUJUUUI0JUUUUUI",
            "0JUJUUUI0JUUUIUI",
            "0JUJUUUI0JUUUIUI",
            "0JUUUUUI0JUUUIUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JIUUUUI",
            "0JUUUIUI0JIUUUUI",
            "0JUUUIUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI"
        ],
        [
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUIUUI0JUJUUUI",
            "0JUUIUUI0JUJUUUI",
            "0JUUIUUI0JUJUUUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUUJUI0JUUUUUI",
            "0JUUUJUI0JUUUIUI",
            "0JUUUJUI0JUUUIUI",
            "0JUUUUUI0JUUUUUI",
            "0JUUUUUI0JUUUUUI",
            "0JIUUUUI0JUUUUUI",
            "0JIUUUUI0JUUUUUI"
        ]
    ];
    // A carved maze relief set into the back wall: the site's own motif. 32 x 32.
    const RELIEF = [
        "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII",
        "IJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJI",
        "IJUUUUUUUUUUUUUUUUUUUUUUUUUUUUJI",
        "IJUIIIIIIIIIIIIIIIIIIIIIIIIIIUJI",
        "IJUIJJJJJJJJJJJJJJJJJJJJJJJJIUJI",
        "IJUIJUUUUUUUUUUUUUUUUUUUUUUJIUJI",
        "IJUIJUIIIIIIIIIIIIIIIIIIIIUJIUJI",
        "IJUIJUIJJJJJJJJJJJJJJJJJJIUJIUJI",
        "IJUIJUIJUUUUUUUUUUUUUUUUJIUJIUJI",
        "IJUIJUIJUIIIIIIIIIIIIIIUJIUJIUJI",
        "IJUIJUIJUIJJJJJJJJJJJJIUJIUJIUJI",
        "IJUIJUIJUIJUUUUUUUUUUJIUJIUJIUJI",
        "IJUIJUIJUIJUIIIIIIIIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIJJJJJJIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIJ....JIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIJ....JIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIJ....JIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIJ....JIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIJJ..JJIUJIUJIUJIUJI",
        "IJUIJUIJUIJUIII..IIIUJIUJIUJIUJI",
        "IJUIJUIJUIJUUUU..UUUUJIUJIUJIUJI",
        "IJUIJUIJUIJJJJJ..JJJJJIUJIUJIUJI",
        "IJUIJUIJUIIIIII..IIIIIIUJIUJIUJI",
        "IJUIJUIJUUUUUUU..UUUUUUUJIUJIUJI",
        "IJUIJUIJJJJJJJJ..JJJJJJJJIUJIUJI",
        "IJUIJUIIIIIIIII..IIIIIIIIIUJIUJI",
        "IJUIJUUUUUUUUUU..UUUUUUUUUUJIUJI",
        "IJUIJJJJJJJJJJJ..JJJJJJJJJJJIUJI",
        "IJUIIIIIIIIIIII..IIIIIIIIIIIIUJI",
        "IJUUUUUUUUUUUUU..UUUUUUUUUUUUUJI",
        "IJJJJJJJJJJJJJJ..JJJJJJJJJJJJJJI",
        "IIIIIIIIIIIIIII..IIIIIIIIIIIIIII"
    ].map(r => r.replace(/\./g, "I"));

    // A signpost (13 Oct 2026, for the tutorial): a board on a post, a question mark cut into it. 16 x 16.
    const SIGN = [
        "................",
        ".kkkkkkkkkkkkkk.",
        ".kDDDDDDDDDDDDk.",
        ".kCAAAA66AAAA9k.",
        ".kCAAA6AA6AAA9k.",
        ".kCAAAAAA6AAA9k.",
        ".kCAAAAA6AAAA9k.",
        ".kCAAAAAAAAAA9k.",
        ".kCAAAAA6AAAA9k.",
        ".k888888888888k.",
        ".kkkkkk87kkkkkk.",
        "......k87k......",
        "......k87k......",
        "......k87k......",
        "......k87k......",
        "......k76k......"
    ];

    /* The checkpoint (13 Oct 2026): a wooden pole as tall as Scout, a gold
       knob on top, a red pennant with a gold stripe, stirring; once he has
       passed it the pennant is gone (he has it: it shows in the corner).
       14 x 24. And the corner's small one, 10 x 12. */
    const FLAG = [
        [
            ".kk...........",
            "k45k..........",
            "k42k..........",
            "kA8kkkk.......",
            "kA8kxXXkkk....",
            "kA8kxXXXXXkk..",
            "kA8kx44444XXk.",
            "kA8kxXXXXXXXXk",
            "kA8kx44444XXk.",
            "kA8kxXXXXXkk..",
            "kA8kxXXkkk....",
            "kA8kkkk.......",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kjmjk.........",
            "kkkkk........."
        ],
        [
            ".kk...........",
            "k45k..........",
            "k42k..........",
            "kA8kkkk.......",
            "kA8kxXXkk.....",
            "kA8kxXXXXkk...",
            "kA8kx4444XXk..",
            "kA8kxXXXXXXXk.",
            "kA8kx44444XXXk",
            "kA8kxXXXXXXkk.",
            "kA8kxXXkkk....",
            "kA8kkkk.......",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kjmjk.........",
            "kkkkk........."
        ]
    ];
    const FLAG_POLE = [
            ".kk...........",
            "k45k..........",
            "k42k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kA8k..........",
            "kjmjk.........",
            "kkkkk........."
    ];
    const FLAG_ICON = [
            "kk........",
            "k5k.......",
            "kAkkk.....",
            "kAkxXkk...",
            "kAkx44Xkk.",
            "kAkxXXXXk.",
            "kAkxXkkk..",
            "kAkkk.....",
            "kAk.......",
            "kAk.......",
            "kAk.......",
            "kkk......."
    ];

    /* PROPS (13 Oct 2026, "loads of crates, barrels, rubble"): set about the
       mine's floors behind everything, a barrel hooped in iron and a heap
       of fallen stone; and the rock that falls from a crack in the roof.
       12 x 14, 16 x 8, 12 x 10. */
    const BARREL = [
        "..kkkkkkkk..",
        ".k9AAAA998k.",
        ".kjmmmmmmjk.",
        "kA998999887k",
        "kA998999887k",
        "kjmmmmmmmmjk",
        "kA998999887k",
        "kA998999887k",
        "kA998999887k",
        "kjmmmmmmmmjk",
        "kA998999887k",
        ".kjmmmmmmjk.",
        ".k98888887k.",
        "..kkkkkkkk.."
    ];
    const RUBBLE = [
        "......kkkk......",
        ".....kNNMMk.....",
        "...kkkMMMKKkk...",
        "..kNMkKKKkkNMk..",
        ".kNMMKkEkkNMMKk.",
        ".kMKKKKkEkMKKKEk",
        "kKKKEEEkkKKEEEEk",
        "kkkkkkkkkkkkkkkk"
    ];
    const ROCK = [
        "...kkkkk....",
        "..kNNMMMk...",
        ".kNMMMMKKk..",
        "kNMMMKKKKKk.",
        "kMMMKKKKKEk.",
        "kMMKKKKEEEk.",
        ".kKKKEEEEk..",
        "..kKEEEkk...",
        "...kkkk.....",
        "............"
    ];

    /* DYNAMITE (13 Oct 2026): a red stick, a paper band round it, its fuse
       curling up; and the HUD's small one. 10 x 16, 7 x 12. */
    const DYNAMITE = [
        "......9...",
        ".....9.A..",
        ".....9....",
        "....99....",
        "...kkkk...",
        "..k%$@!k..",
        "..k$@!k..",
        "..k$@!k..",
        "..kccqqk..",
        "..kccqqk..",
        "..k$@!k..",
        "..k$@!k..",
        "..k$@!k..",
        "..k$@@!k..",
        "...kkkk...",
        ".........."
    ];
    const DYNAMITE_ICON = [
        "...9...",
        "..9....",
        ".kkkk..",
        "k$@!k.",
        "k$@!k.",
        "kccqqk.",
        "k$@!k.",
        "k$@!k.",
        "k$@@!k.",
        ".kkkk..",
        ".......",
        "......."
    ];
    /* A RUBBLE PILE blocking the way (13 Oct 2026): stones heaped, each lit
       from the top left; a mound's top tile and its body, two of each so a
       big pile does not repeat. 16 x 16. Made in the scratchpad's
       ratrace/dyn-art.js. */
    const PILE_TOP = [
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            ".....kkkkkk.....",
            "...kkkkkMKKkk...",
            "..kNNMNMMkkMkk..",
            ".kNMMkNMMMMKKMk.",
            ".EkMMkMMKMKKkkK.",
            "kEEEEkMKKKKkNMMk",
            "EEEEEEMKKEEkkkkk",
            "EEEEEEEkEEkkNNMM",
            "MkEEEEEEENkNNMMM",
            "MKkEEEEENMkMMMMK",
            "KKEEEEEEMMkMMMKK"
        ],
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            ".....kkkkkk.....",
            "...kkMKkNMMkk...",
            "..kEkKKkMMKKKk..",
            ".kkEEEEEkKKKkkk.",
            ".MKEEEEEEEEkkkk.",
            "kKKEEEEEEEEEEEEk",
            "KKkEENNMMMEEEEEE",
            "EkNNMMkMMKKEkNNN",
            "kNMMMMKkkKkNNMkM",
            "kMMMKKKkKKNMMMMk",
            "EEkkkkKKkNMMMKKk"
        ]
    ];
    const PILE = [
        [
            "kkKKkkkkkkMMNMMM",
            "MMKkkNNMMMMMkMMK",
            "MKKNNMMMKKkkkkKK",
            "NNMMMMMKKKKKkkMK",
            "NMMMMkKKkkNkMMkK",
            "MMMMKKKEkNMMMKKM",
            "MMMKKKkkNNMKkKkK",
            "kKKKKkNNMMMKkNMM",
            "MMKkEkMMMMKKkMMK",
            "kkNMMEkMKKkkMMKK",
            "NNMMKkEEEEEEkKKK",
            "MMMKKkEEEEEkNNkM",
            "MkKKkEEEkNNkNNkk",
            "KKKkkEkNNkNMMMMM",
            "KKkMMkkMNMMkKMMK",
            "NMMMKKEkMMKKKKKK"
        ],
        [
            "kNMkNMkMMMNNMMMM",
            "MMkNkkNMMkNMMKkK",
            "KKkkNMMMkkMMKKkK",
            "kNMkMMKKKkMKKKKK",
            "kMMKkkKkkEkkkkKk",
            "EEENkkNNNMMkMKKK",
            "EEkkNNNMMMMKkkNN",
            "EEENNMMMMKKKkNNM",
            "EEEkMkMMKKKkkNMM",
            "EEEkMMKkkkNNkMMK",
            "EEEEkkKkNkNNkMKK",
            "EEEEEENkNNMMMKkk",
            "EEEEEEMkkMMKKKkK",
            "EEEEEEEkkkNMMMMK",
            "EEEEEEEENNMMKMKK",
            "EEEEEEEEkkKKkkkk"
        ]
    ];

    /* ---------------------------------------------------------------- THE NEW THINGS (22 Oct 2026)
       The owner's picks from the list: a mine cart, the mummy, the ghost miner, a snake in an urn, a torch on a
       bracket to carry. Each with its own colours (pal) where the shared ones have none to spare. */
    /* HANGING FROM A SWING (22 Oct 2026, the owner's: "make it more of a natural swing"): side on, both arms up
       past the back of his hat to his hands on the rope (rows 0-2, about column 7-8), his legs kicking forward
       (0) or trailing behind (1) as the swing goes. 16 x 26. */
    const SWING_ARMS = [
        ".......kk.......",
        "......kssk......",
        "......kssk......",
        "......kOOk......"
    ];
    const SWING_BODY = [
        "....kOOlllOOk...",
        "...kOOOOgOOOOk..",
        "...kOlOOOgOOOk..",
        "...kkkggggyggk.."
    ];
    const SWING_HANG = [SWING_ARMS.concat(HEAD.slice(1), SWING_BODY, [
        "....kYYYYYYYYk..",
        "....kYYukYYYYYk.",
        "....kSSk.kkSSSBk",
        "....kBBk...kkBBk",
        "...kBBBk....kkk.",
        "...kkkkk........"
    ]), SWING_ARMS.concat(HEAD.slice(1), SWING_BODY, [
        "....kYYYYYYYYk..",
        "...kYYYYYkuYYk..",
        ".kBSSSkk.kSSk...",
        "kBBkk....kBBk...",
        ".kkk....kBBBk...",
        "........kkkkk..."
    ])];
    // A swinging rope's end: a fat stopper knot to hold on above, then frayed. 8 x 8, the rope's middle between columns 3 and 4.
    const ROPE_KNOT = [
        ".k[(([k.",
        "k(()[[]k",
        "k)(][[]k",
        "k(]()][k",
        ".k)[[]k.",
        "..()[)..",
        ".(.)[.).",
        "(..)..[)"
    ];
    // The mine cart's tub: iron rim and bands, oak planks; its wheels are the game's, turning. 24 x 9.
    const cartRow = (lit, a, b, shade) => ".k" + lit + [...Array(18)].map((_, i) => (i === 3 || i === 16 ? "j" : i % 2 ? b : a)).join("") + shade + "k.";
    const MINE_CART = [
        "kkkkkkkkkkkkkkkkkkkkkkkk",
        "knnnnnnnnnnnnnnnnnnnnnmk",
        "kjmmmmmmmmmmmmmmmmmmmmjk",
        cartRow("C", "A", "A", "8"),
        cartRow("A", "9", "9", "8"),
        cartRow("C", "A", "A", "8"),
        cartRow("A", "9", "9", "7"),
        ".kjjjjjjjjjjjjjjjjjjjjk.",
        "..kkkkkkkkkkkkkkkkkkkk.."
    ];
    /* THE MINE CARTS STANDING ABOUT (23 Oct 2026, the owner's: "replace the current mine cart scenery item with the new
       mine cart design, and add some variants of broken ones and stuff too"): the cart Scout rides, made up with its
       wheels (the game's, at rest), and as it is found left in the mine: full of ore, lost a wheel and down on its
       corner, upturned, on its side with its ore spilt, smashed; and a wheel on its own. */
    const CART_PAL = { q: "#0e0e12", r: "#23232b", s: "#44444f", t: "#74748a", u: "#b2b2c4", O: "#2e2c36", P: "#565262", R: "#86808f", S: "#bdb6c6", G: "#e0b040", w: "#55331a", W: "#96633a" };
    const CART_WHEEL_REST = ["..qqq..", ".qtrtq.", "qrrsrrq", "qtsustq", "qrrsrrq", ".qrsrq.", "..qqq.."];
    const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
    const stamp = (g, rows, ox, oy) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== "." && g[oy + j] && ox + i >= 0 && ox + i < g[oy + j].length) g[oy + j][ox + i] = r[i]; });
    const rowsOf = g => g.map(r => r.join(""));
    const ch = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const cartGrid = (wheels) => { const g = grid(24, 14); stamp(g, MINE_CART, 0, 0); if (wheels.includes(0)) stamp(g, CART_WHEEL_REST, 2, 7); if (wheels.includes(1)) stamp(g, CART_WHEEL_REST, 15, 7); return g; };
    // a heap of ore over the cart's mouth: coal and rock in lumps, lit from above, a glint of ore here and there
    const oreHeap = (w, peak, seed) => {
        const g = grid(w, peak + 1);
        for (let i = 0; i < w; i++) {
            const d = Math.abs(i - (w - 1) / 2) / ((w - 1) / 2), hgt = Math.max(1, Math.min(peak, Math.round(peak * (1 - d * d * 0.75) + (ch(i, seed) - 0.5) * 1.6)));   // (a full mound, its lumps standing up out of it)
            for (let j = 0; j < hgt; j++) { const y = peak - j, top = j === hgt - 1, v = ch(i * 3 + j, seed + 7); g[y][i] = top ? "k" : v < 0.08 ? "G" : v < 0.35 ? "O" : v < 0.7 ? "P" : j >= hgt - 2 ? "S" : "R"; }
        }
        return rowsOf(g);
    };
    const CART_FULL = (() => { const g = grid(24, 19); stamp(g, oreHeap(20, 6, 3), 2, 0); const c = cartGrid([0, 1]); for (let y = 0; y < 14; y++) for (let x = 0; x < 24; x++) if (c[y][x] !== ".") g[y + 5][x] = c[y][x]; return rowsOf(g); })();
    // lost its front wheel: down on that corner, pivoting on the wheel it has
    const CART_LAME = (() => { const c = cartGrid([0]), g = grid(24, 14); for (let x = 0; x < 24; x++) { const d = Math.round(Math.max(0, x - 5) * 5 / 18); for (let y = 0; y < 14; y++) if (c[y][x] !== "." && y + d < 14) g[y + d][x] = c[y][x]; } return rowsOf(g); })();
    const CART_UPTURNED = rowsOf(cartGrid([0, 1]).slice().reverse());
    // on its side, its mouth to the right, its ore spilt out beside it
    const CART_SIDE = (() => {
        const c = cartGrid([0, 1]), g = grid(30, 24);
        for (let y = 0; y < 14; y++) for (let x = 0; x < 24; x++) if (c[y][x] !== ".") g[x][13 - y] = c[y][x];
        stamp(g, oreHeap(16, 5, 11), 14, 18);
        return rowsOf(g);
    })();
    // smashed: its rim broken in, planks stove in, a wheel gone, boards lying by it
    const CART_WRECK = (() => {
        const c = cartGrid([0]), g = grid(32, 14);
        for (let x = 0; x < 24; x++) { const d = Math.round(Math.max(0, x - 5) * 4 / 18); for (let y = 0; y < 14; y++) if (c[y][x] !== "." && y + d < 14) g[y + d][x] = c[y][x]; }
        // the notch broken out of its rim, and holes in its planks
        for (let x = 9; x <= 15; x++) { const deep = 3 - Math.abs(x - 12) + (x % 2); for (let y = 0; y < 14; y++) if (g[y][x] !== "." && y - Math.round(Math.max(0, x - 5) * 4 / 18) < deep) g[y][x] = "."; }
        for (const [hx, hy] of [[6, 4], [7, 4], [17, 6], [18, 6], [18, 7], [12, 7]]) { const d = Math.round(Math.max(0, hx - 5) * 4 / 18); if (g[hy + d] && g[hy + d][hx] !== ".") g[hy + d][hx] = "k"; }
        // two boards lying on the floor beside it
        stamp(g, ["kkkkkkk", "kWwWwWk", "kkkkkkk"], 24, 11); stamp(g, [".kkkk", "kWwwk", "kkkk."], 26, 8);
        return rowsOf(g);
    })();

    // The mummy: wrapped head to foot, its eyes alight, its arms out ahead of it. Walking (two frames), 16 x 24; and,
    // once stomped, its top half dragging itself along (two frames), 20 x 10.
    const MUMMY_PAL = { "-": "#e6dcc0", "_": "#bcae88", "`": "#857a5a", ",": "#ffd34a" };
    const MUMMY_TOP = [
        "................",
        "......kkkk......",
        ".....k-__-k.....",
        "....k-_``_-k....",
        "....k_,k_,`k....",
        "....k-___-_k....",
        "....k`-__`k.....",
        ".....k_-_kk.....",
        "....kk-__-kkkkk.",
        "...k-_-__-_-__-k",
        "...k_`-__`_--_k.",
        "...k-__-_`kkkk..",
        "...k`_-__-k.....",
        "...k_-_`_-k.....",
        "...k-__-_`k.....",
        "...k`_-_-_k....."
    ];
    const MUMMY_WALK = [MUMMY_TOP.concat([
        "....k-_k-_k.....",
        "....k_`k_-k.....",
        "....k-_k`_k.....",
        "....k_-kk-_k....",
        "...k-_`k.k_-k...",
        "...k`_-k.k-_k...",
        "...k--_k.k_--k..",
        "...kkkkk.kkkkk.."
    ]), MUMMY_TOP.concat([
        "....k-_k-_k.....",
        "....k_`k_-k.....",
        "....k-_kk_k.....",
        "....k_-k`_k.....",
        "....k-_k-_k.....",
        "...k`_-kk-_k....",
        "..k--_k.k_--k...",
        "..kkkkk.kkkkk..."
    ])];
    const MUMMY_CRAWL = [[
        "...........kkkk.....",
        "..........k-__-k....",
        "....kkkkkk_,k_,k....",
        "..kk-_-__-_`__-kkkk.",
        ".k-__`-_-__-_`-_-_-k",
        "k_`-__-_`_-__-_kkkk.",
        "k-_`kk-_-_kk_-k.....",
        ".kk..k`_-k..k`k.....",
        ".....kk_`k...kk.....",
        "......kkk..........."
    ], [
        "...........kkkk.....",
        "..........k-__-k....",
        "....kkkkkk_,k_,k....",
        "..kk-_-__-_`__-kkk..",
        ".k-__`-_-__-_`-_-_k.",
        "k_`-__-_`_-__-_kkkkk",
        "k-_`kk-_-_kk_-k_-_-k",
        ".kk..k`_-k..k`kkkkk.",
        ".....kk_`k...kk.....",
        "......kkk..........."
    ]];
    // A clay urn, a gold band round it; a snake lives in it (the game draws it rising out). 16 x 16. Its head, 8 x 5.
    const URN_PAL = { "-": "#d98a52", "_": "#a8582e", "`": "#6e3418", ",": "#e9c27a" };
    const URN = [
        "....kkkkkkkk....",
        "...k-______`k...",
        "....k-___`kk....",
        "....k_-__`k.....",
        "...k-_____`k....",
        "..k-,,,,,,,`k...",
        ".k-_________`k..",
        ".k-_-_______`k..",
        ".k-__________`k.",
        ".k-_________``k.",
        ".k-,,,,,,,,,,`k.",
        "..k-________`k..",
        "..k`________`k..",
        "...k`______`k...",
        "....k``````k....",
        ".....kkkkkk....."
    ];
    const SNAKE_PAL = { "-": "#9ad06a" };
    const SNAKE_HEAD = [
        ".kkkkk..",
        "k-VV*Vk.",
        "kVVVVVVk",
        "kvvvvvk.",
        ".kkkkk.."
    ];
    // A torch in an iron ring on a wall bracket, its head a pitch-soaked rag; the game lights it. 12 x 16.
    const TORCH_BRACKET = [
        "............",
        "............",
        "............",
        "............",
        "....k}}k....",
        "....k{}k....",
        "....k}{k....",
        "....kA9k....",
        "kk..kA9k....",
        "kmkkjmmjk...",
        "knjjkA9k....",
        "kmk.kA9k....",
        "kk..kA9k....",
        "....k98k....",
        ".....kk.....",
        "............"
    ];

    window.RatArt = {
        pal, candles: CANDLES,
        sprites: {
            scoutIdle: { frames: [scout(legsStand), BLINK.concat(legsStand)] },
            scoutRun: { frames: RUN6.map(scout) },   // (23 Oct 2026: six frames, each leg in turn; runA to runC kept for the editor's old pictures)
            scoutSlideDown: { rows: SLIDE_DOWN },
            scoutJump: { rows: scout(jumpUp) },
            scoutFall: { rows: scout(fall) },
            scoutClimb: { frames: [BACK.concat(climbA), BACK.concat(climbB)] },
            scoutCrouch: { rows: crouch },
            scoutCrawl: { frames: CRAWL },   // (23 Oct 2026: put together from parts; crawl0 to crawl3 the old ones)
            scoutSwim: { frames: SWIM },
            scoutSlide: { frames: [swim0] },   // (21 Oct 2026) on his front, arm out ahead: the run-into-a-crawl slide
            scoutWall: { rows: scout(wallSlide) },
            scoutMantle: { rows: MANTLE_HAUL },
            mineCart: { rows: MINE_CART },
            cart: { rows: rowsOf(cartGrid([0, 1])), pal: CART_PAL }, cartOre: { rows: CART_FULL, pal: CART_PAL }, cartLame: { rows: CART_LAME, pal: CART_PAL },
            cartUpturned: { rows: CART_UPTURNED, pal: CART_PAL }, cartSide: { rows: CART_SIDE, pal: CART_PAL }, cartWreck: { rows: CART_WRECK, pal: CART_PAL }, cartWheel: { rows: CART_WHEEL_REST, pal: CART_PAL },
            scoutSwing: { frames: SWING_HANG }, ropeKnot: { rows: ROPE_KNOT },
            mummy: { frames: MUMMY_WALK, pal: MUMMY_PAL }, mummyCrawl: { frames: MUMMY_CRAWL, pal: MUMMY_PAL },
            snake: { rows: URN, pal: URN_PAL }, snakeHead: { rows: SNAKE_HEAD, pal: SNAKE_PAL },
            torchBracket: { rows: TORCH_BRACKET },
            scoutPush: { frames: [scout(pushA), scout(pushB)] },
            scoutHurt: { rows: HURT_HEAD.concat(hurt) },
            scoutCheer: { rows: CHEER_HEAD.concat(cheer) },
            coin: { frames: COIN },
            key: { rows: KEY },
            keyIcon: { rows: KEY_ICON },
            gem: { rows: GEM },
            hat: { rows: HAT },
            torchBase: { rows: TORCH_BASE },
            flame: { frames: FLAME },
            lampHang: { rows: LAMP_HANG }, lampOil: { rows: LAMP_OIL }, lampFloor: { rows: LAMP_FLOOR },
            candlePillar: { rows: CANDLE_PILLAR }, candleStub: { rows: CANDLE_STUB }, candleTrio: { rows: CANDLE_TRIO }, candleTaper: { rows: CANDLE_TAPER },
            candleArms: { rows: CANDLE_ARMS }, candleSconce: { rows: CANDLE_SCONCE }, candleSkull: { rows: CANDLE_SKULL }, candleBottle: { rows: CANDLE_BOTTLE },
            candleCradle: { rows: CANDLE_CRADLE }, candleRing: { rows: CANDLE_RING }, fireflyJar: { rows: FIREFLY_JAR },
            crate: { rows: CRATE },
            pushCrate: { rows: PUSH_CRATE },
            knife: { rows: KNIFE },
            spikes: { rows: SPIKES },
            rat: { frames: RAT },
            bat: { frames: BAT },
            spider: { frames: SPIDER },
            planks: { frames: PLANKS },
            lip: { rows: LIP },
            beam: { rows: BEAM },
            ladder: { rows: LADDER },
            ladderOld: { frames: [LADDER_OLD, LADDER_OLD_SPLIT] }, ladderBroken: { rows: LADDER_BROKEN },
            rope: { rows: ROPE },
            ropeTop: { rows: ROPE_TOP },
            ropeEnd: { rows: ROPE_END },
            door: { rows: DOOR },
            doorOpen: { rows: DOOR_OPEN },
            padlock: { rows: PADLOCK },
            web: { rows: WEB },
            banner: { rows: BANNER },
            backwall: { frames: BACKWALL },
            relief: { rows: RELIEF },
            sign: { rows: SIGN },
            flag: { frames: FLAG },
            flagPole: { rows: FLAG_POLE },
            flagIcon: { rows: FLAG_ICON },
            barrel: { rows: BARREL },
            rubble: { rows: RUBBLE },
            rock: { rows: ROCK },
            dynamite: { rows: DYNAMITE },
            dynamiteIcon: { rows: DYNAMITE_ICON },
            pileTop: { frames: PILE_TOP },
            pile: { frames: PILE }
        }
    };
})();

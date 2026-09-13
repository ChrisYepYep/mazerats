/* THE FURNI LINES THAT LEAD THE ROOMS, one per level from 9 to 49.

   Every room in this game is the same three areas — a host's booth, a queue
   from the door, a floor to play on — so what makes one room different from
   the next is the line of furniture it is dressed in and the colours behind
   it. That is what lives here. The shapes live in ff-levels-designs.js.

   A theme names:

     seats     three classes that fall: a two- or three-tile one and two
               single-tile ones. The mixture is deliberate — a sequence of
               six identical chairs is a memory test nobody can pass, and a
               sofa among the chairs gives you something to count from.
     decoy     a seat that looks like it belongs and does not. From level 12.
     poi       one thing worth walking to. From level 30.
     obstacle  something solid that is in the way.
     lamp      a light for the booth. Every room gets two.
     plant     one plant. ONE. An earlier draft put eleven bonsais in a
               cathedral and it was the first thing that got sent back.
     tall      a bookcase or shelving, or nothing. Only ever goes along the
               back wall or the left one: x+y is the draw order, so anything
               tall nearer the front stands between the camera and the game.
     screen    the barrier, 2x1, and `gate` the one tile you come through.
               Most lines don't ship their own, and borrowing silo's Screen
               is what the hand-built levels do, so that is the default.

   Class names are checked against furnidata by the build, so a typo here is
   a loud failure and not a silently missing chair. */

const NEUTRAL = {
    screen: "divider_silo2",        // Screen, 2x1
    gate: "divider_silo3",          // Gate (lockable), 1x1
    corner: "divider_arm1",         // Corner plinth, 1x1
    narrow: "divider_arm1",
    lamp: "lamp_armas",
    plant: "plant_yukka",
    tall: null,
    obstacle: "plant_small_cactus",
    poi: "throne",                  // a seat, because a poi joins the sequence
    decoy: null
};

/* floor/wall are {pattern, colour} and the colour has to be one this pattern
   actually ships — room-patterns.js lists them per pattern, and the build
   checks. */
const THEMES = [
    /* ---- gothic, six colourways of the same three shapes. A cathedral is
       lit by candles and nothing else grows in it. */
    {
        level: 9, name: "Golden Gothic Chapel",
        seats: ["gothic_sofa*2", "gothic_chair*2", "gothic_stool*2"],
        decoy: "gothic_chair*4", obstacle: "gothiccandelabra",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "gothiccandelabra", plant: "plant_bonsai",
        floor: { pattern: "tiles3", colour: 501 }, wall: { pattern: "gothic", colour: 3104 }
    },
    {
        level: 10, name: "Black Gothic Crypt",
        seats: ["gothic_sofa*4", "gothic_chair*4", "gothic_stool*4"],
        decoy: "gothic_chair*3", obstacle: "skullcandle",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "skullcandle", plant: null,
        floor: { pattern: "tiles3", colour: 502 }, wall: { pattern: "plain", colour: 202 }
    },
    {
        level: 11, name: "Red Gothic Chapel",
        seats: ["gothic_sofa*3", "gothic_chair*3", "gothic_stool*3"],
        decoy: "gothic_chair*1", obstacle: "gothiccandelabra",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "gothiccandelabra", plant: null,
        floor: { pattern: "tiles3", colour: 502 }, wall: { pattern: "gothic", colour: 3103 }
    },
    {
        level: 12, name: "Green Gothic Hall",
        seats: ["gothic_sofa*5", "gothic_chair*5", "gothic_stool*5"],
        decoy: "gothic_chair*6", obstacle: "gothiccandelabra",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "gothiccandelabra", plant: "plant_bonsai",
        floor: { pattern: "tiles3", colour: 502 }, wall: { pattern: "half3", colour: 805 }
    },
    {
        level: 13, name: "Blue Gothic Hall",
        seats: ["gothic_sofa*6", "gothic_chair*6", "gothic_stool*6"],
        decoy: "gothic_chair*5", obstacle: "skullcandle",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "gothiccandelabra", plant: "plant_bonsai",
        floor: { pattern: "tiles5", colour: 602 }, wall: { pattern: "ornament3", colour: 2703 }
    },
    {
        level: 14, name: "Pink Gothic Hall",
        seats: ["gothic_sofa*1", "gothic_chair*1", "gothic_stool*1"],
        decoy: "gothic_chair*2", obstacle: "gothiccandelabra",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "gothiccandelabra", plant: "plant_bonsai",
        floor: { pattern: "tiles5", colour: 604 }, wall: { pattern: "gothic", colour: 3101 }
    },

    /* ---- asian gothic, the same silhouette in lacquer */
    {
        level: 15, name: "Lacquer Room",
        seats: ["asian_gothic_sofa*1", "asian_gothic_chair*1", "gothic_stool*3"],
        decoy: "asian_gothic_chair*2", obstacle: "plant_bonsai",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "hc_lmp", plant: "plant_bonsai",
        floor: { pattern: "tiles2", colour: 405 }, wall: { pattern: "ornament1", colour: 2501 }
    },
    {
        level: 16, name: "Vermilion Room",
        seats: ["asian_gothic_sofa*2", "asian_gothic_chair*2", "gothic_stool*4"],
        decoy: "asian_gothic_chair*1", obstacle: "plant_bonsai",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "hc_lmp", plant: "plant_bonsai",
        floor: { pattern: "tiles2", colour: 407 }, wall: { pattern: "ornament2", colour: 2604 }
    },

    /* ---- funky polyfon, four colourways, each with the plain chair mixed in
       so the sequence is never three of a kind */
    {
        level: 17, name: "Funky Lounge Red",
        seats: ["funky_sofa_polyfon*1", "funky_sofachair_polyfon*1", "chair_polyfon"],
        decoy: "funky_sofachair_polyfon*6", obstacle: "plant_small_cactus",
        tall: "shelves_polyfon", lamp: "lamp_armas",
        floor: { pattern: "wood", colour: 301 }, wall: { pattern: "stripes", colour: 501 }
    },
    {
        level: 18, name: "Funky Lounge Blue",
        seats: ["funky_sofa_polyfon*6", "funky_sofachair_polyfon*6", "sofachair_polyfon"],
        decoy: "funky_sofachair_polyfon*8", obstacle: "plant_small_cactus",
        tall: "shelves_polyfon", lamp: "lamp2_armas",
        floor: { pattern: "wood", colour: 305 }, wall: { pattern: "stripes", colour: 504 }
    },
    {
        level: 19, name: "Funky Lounge Green",
        seats: ["funky_sofa_polyfon*8", "funky_sofachair_polyfon*8", "chair_polyfon"],
        decoy: "funky_sofachair_polyfon*10", obstacle: "plant_big_cactus",
        tall: "shelves_polyfon", lamp: "lamp_armas",
        floor: { pattern: "wood", colour: 304 }, wall: { pattern: "stripes", colour: 506 }
    },
    {
        level: 20, name: "Funky Lounge Violet",
        seats: ["funky_sofa_polyfon*10", "funky_sofachair_polyfon*10", "sofachair_polyfon"],
        decoy: "funky_sofachair_polyfon*1", obstacle: "plant_small_cactus",
        tall: "shelves_polyfon", lamp: "lamp2_armas",
        floor: { pattern: "wood", colour: 306 }, wall: { pattern: "stripes", colour: 508 }
    },

    /* ---- polyfon and dark polyfon, the flats people actually lived in */
    {
        level: 21, name: "Pura Bedsit",
        seats: ["sofa_polyfon_girl", "sofachair_polyfon_girl", "chair_polyfon"],
        decoy: "sofachair_polyfon", obstacle: "plant_yukka",
        tall: "shelves_polyfon", lamp: "lamp_armas",
        floor: { pattern: "wood", colour: 307 }, wall: { pattern: "half2", colour: 704 }
    },
    {
        level: 22, name: "Dark Polyfon Studio",
        seats: ["sofa_dpolyfon*1", "sofachair_dpolyfon*1", "chair_polyfon"],
        decoy: "sofachair_dpolyfon*2", obstacle: "bar_dpolyfon*1",
        tall: "shelves_dpolyfon*1", lamp: "lamp2_armas",
        floor: { pattern: "wood", colour: 303 }, wall: { pattern: "half1", colour: 603 }
    },
    {
        level: 23, name: "Dark Polyfon Loft",
        seats: ["sofa_dpolyfon*2", "sofachair_dpolyfon*2", "sofachair_polyfon"],
        decoy: "sofachair_dpolyfon*11", obstacle: "bar_dpolyfon*1",
        tall: "shelves_dpolyfon*1", lamp: "lamp_armas",
        floor: { pattern: "wood", colour: 302 }, wall: { pattern: "half1", colour: 607 }
    },
    {
        level: 24, name: "Dark Polyfon Suite",
        seats: ["sofa_dpolyfon*11", "sofachair_dpolyfon*11", "chair_polyfon"],
        decoy: "sofachair_dpolyfon*1", obstacle: "plant_yukka",
        tall: "shelves_dpolyfon*1", lamp: "lamp2_armas",
        floor: { pattern: "tiles5", colour: 603 }, wall: { pattern: "half3", colour: 805 }
    },

    /* ---- plasto and plasty: one shape, a great many colours, so the
       sequence is colour and the mixture has to come from elsewhere */
    {
        level: 25, name: "Plasto Primaries",
        seats: ["bench_autumn", "chair_plasto*101", "chair_plasto*105"],
        decoy: "chair_plasto*102", obstacle: "plant_small_cactus",
        tall: "shelves_polyfon", lamp: "lamp_armas", plant: "plant_pineapple",
        floor: { pattern: "plain", colour: 107 }, wall: { pattern: "lively", colour: 101 }
    },
    {
        level: 26, name: "Plasto Pastels",
        seats: ["bench_autumn", "chair_plasto*104", "chair_plasto*117"],
        decoy: "chair_plasto*14", obstacle: "plant_small_cactus",
        tall: "shelves_polyfon", lamp: "lamp2_armas", plant: "giftflowers",
        floor: { pattern: "plain", colour: 106 }, wall: { pattern: "lively", colour: 105 }
    },
    {
        level: 27, name: "Plasty Brights",
        seats: ["sofa_silo2*5", "chair_plasty*101", "chair_plasty*103"],
        decoy: "chair_plasty*102", obstacle: "plant_big_cactus",
        tall: "shelves_silo", lamp: "lamp_armas", plant: "plant_small_cactus",
        floor: { pattern: "plain", colour: 103 }, wall: { pattern: "lively", colour: 109 }
    },
    {
        level: 28, name: "Plasty Deep",
        seats: ["sofa_silo2*5", "chair_plasty*105", "chair_plasty*109"],
        decoy: "chair_plasty*117", obstacle: "plant_big_cactus",
        tall: "shelves_silo", lamp: "lamp2_armas", plant: "plant_small_cactus",
        floor: { pattern: "plain", colour: 104 }, wall: { pattern: "lively", colour: 113 }
    },

    /* ---- summer, which is the one range that comes with its own spectacle */
    {
        level: 29, name: "Summer Barbecue",
        seats: ["bench_armas", "summer_chair*1", "summer_chair*3"],
        decoy: "summer_chair*2", obstacle: "summer_grill*1", poi: "summer_chair*8",
        tall: null, lamp: "lamp_armas", plant: "plant_pineapple",
        floor: { pattern: "fuzzy", colour: 201 }, wall: { pattern: "bubbles1", colour: 2801 }
    },
    {
        level: 30, name: "Summer Poolside",
        seats: ["bench_armas", "summer_chair*6", "summer_chair*7"],
        decoy: "summer_chair*9", obstacle: "summer_blaster", poi: "summer_chair*4",
        tall: null, lamp: "lamp2_armas", plant: "plant_pineapple",
        floor: { pattern: "fuzzy", colour: 202 }, wall: { pattern: "bubbles2", colour: 2903 }
    },

    /* ---- armas, twice: the bar and the cabin it grew a log fire in */
    {
        level: 31, name: "Armas Bar",
        seats: ["bench_armas", "bar_chair_armas", "small_chair_armas"],
        decoy: "cabin_bar_chair_armas", obstacle: "bar_armas", poi: "cabin_bench_armas",
        tall: "shelves_armas", lamp: "lamp_armas",
        floor: { pattern: "wood", colour: 302 }, wall: { pattern: "half1", colour: 605 }
    },
    {
        level: 32, name: "Armas Cabin",
        seats: ["cabin_bench_armas", "cabin_bar_chair_armas", "cabin_small_chair_armas"],
        decoy: "small_chair_armas", obstacle: "fireplace_armas", poi: "bench_armas",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "cabin_lamp_armas",
        floor: { pattern: "wood", colour: 303 }, wall: { pattern: "color_wood", colour: 1401 }
    },

    /* ---- silo, its pink reissue, and the executive suite */
    {
        level: 33, name: "Silo Apartment",
        seats: ["sofa_silo", "sofachair_silo", "chair_silo"],
        decoy: "sofachair_polyfon", obstacle: "plant_yukka",
        tall: "shelves_silo", lamp: "lamp_armas",
        floor: { pattern: "tiles5", colour: 601 }, wall: { pattern: "half2", colour: 702 }
    },
    {
        level: 34, name: "The Pink Area",
        seats: ["sofa_silo2*5", "sofachair_silo2*5", "chair_silo2*5"],
        decoy: "barchair_silo2*5", obstacle: "safe_silo2*5",
        corner: "divider_silo12*5", gate: "divider_silo32*5",
        tall: "shelves_silo", lamp: "lamp2_armas", plant: "giftflowers",
        floor: { pattern: "tiles5", colour: 604 }, wall: { pattern: "plain", colour: 204 }
    },
    {
        level: 35, name: "Executive Suite",
        seats: ["exe_sofa", "exe_chair", "exe_chair2"],
        decoy: "chair_silo", obstacle: "exe_drinks", poi: "exe_bath",
        tall: "shelves_armas", lamp: "lamp2_armas", plant: "exe_yukka",
        floor: { pattern: "tiles2", colour: 401 }, wall: { pattern: "plain", colour: 204 }
    },

    /* ---- the club's arabian room, and the basement under it */
    {
        level: 36, name: "Arabian Nights",
        seats: ["hcsohva", "hc_arab_chair", "hc_arab_pllw"],
        decoy: "arabian_chair", obstacle: "hc_arab_snake", poi: "hc_chr",
        tall: null, lamp: "hc_lmp", plant: "plant_bonsai",
        floor: { pattern: "tiles2", colour: 408 }, wall: { pattern: "ornament3", colour: 2701 }
    },
    {
        level: 37, name: "Grunge Basement",
        seats: ["grunge_bench", "grunge_chair", "pillow*0"],
        decoy: "chair_plasto*14", obstacle: "grunge_barrel", poi: "grunge_mattress",
        tall: "grunge_shelf", lamp: "grunge_candle", plant: null,
        floor: { pattern: "plain", colour: 111 }, wall: { pattern: "color_brick1", colour: 1801 }
    },
    {
        level: 38, name: "Romantique Parlour",
        seats: ["romantique_divan*1", "romantique_chair*1", "romantique_pianochair*1"],
        decoy: "chair_frostframe", obstacle: "romantique_smalltabl*1",
        screen: "romantique_divider*1",
        lamp: "lamp_armas", plant: "giftflowers",
        floor: { pattern: "wood", colour: 307 }, wall: { pattern: "ornament1", colour: 2503 }
    },

    /* ---- floor cushions, which are the hardest thing in the game to see */
    {
        level: 39, name: "Cushion Den",
        seats: ["heartsofa", "pillow*1", "pillow*5"],
        decoy: "pillow*9", obstacle: "plant_bonsai",
        tall: null, lamp: "hc_lmp", plant: "plant_bonsai",
        floor: { pattern: "fuzzy", colour: 206 }, wall: { pattern: "half3", colour: 803 }
    },
    {
        level: 40, name: "Damaged Goods",
        seats: ["heartsofa3", "dmg_pillow*2", "dmg_pillow*8"],
        decoy: "dmg_pillow*5", obstacle: "grunge_barrel",
        tall: "grunge_shelf", lamp: "grunge_candle", plant: null,
        floor: { pattern: "plain", colour: 102 }, wall: { pattern: "color_brick2", colour: 1902 }
    },
    {
        level: 41, name: "Picnic Lawn",
        seats: ["country_log", "picnic_pillow", "picnic_pillow_blu"],
        decoy: "picnic_pillow_yel", obstacle: "plant_pineapple", poi: "tiki_bench",
        tall: null, lamp: "lamp_armas", plant: "plant_yukka",
        floor: { pattern: "fuzzy", colour: 201 }, wall: { pattern: "lively", colour: 106 }
    },

    /* ---- the later rooms, where the drops are fast and the furni is loud */
    {
        level: 42, name: "Urban Yard",
        seats: ["urban_carsofa", "rclr_chair", "chair_plasto*109"],
        decoy: "chair_plasty*109", obstacle: "grunge_barrel",
        tall: "grunge_shelf", lamp: "hockey_light", plant: "plant_big_cactus",
        floor: { pattern: "plain", colour: 102 }, wall: { pattern: "color_stripes1", colour: 1501 }
    },
    {
        level: 43, name: "Retro Colour",
        seats: ["rclr_sofa", "rclr_chair", "lc_chair"],
        decoy: "lc_stool", obstacle: "plant_small_cactus",
        tall: "shelves_silo", lamp: "lamp2_armas", plant: "giftflowers",
        floor: { pattern: "plain", colour: 108 }, wall: { pattern: "color_stripes3", colour: 1701 }
    },
    {
        level: 44, name: "The Lodge",
        seats: ["urban_bench", "lc_stool", "tiki_bench"],
        decoy: "lc_chair", obstacle: "grunge_barrel",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "cabin_lamp2_armas",
        floor: { pattern: "wood", colour: 303 }, wall: { pattern: "color_wood", colour: 1401 }
    },
    {
        level: 45, name: "Autumn Terrace",
        seats: ["bench_autumn", "stool_autumn", "chair_frostframe"],
        decoy: "chair_china", obstacle: "plant_yukka",
        screen: "cabin_divider_arm2", gate: "cabin_divider_arm3", corner: "cabin_divider_arm1", narrow: "cabin_divider_arm1",
        tall: "cabin_shelves_armas", lamp: "lamp_armas", plant: "plant_bonsai",
        floor: { pattern: "tiles3", colour: 501 }, wall: { pattern: "half2", colour: 708 }
    },
    {
        level: 46, name: "Valentine Lounge",
        seats: ["heartsofa1", "pillow*1014", "pillow*1019"],
        decoy: "pillow*1021", obstacle: "giftflowers", poi: "heartsofaR",
        screen: "valentinescreen",
        tall: null, lamp: "lamp_armas", plant: "giftflowers",
        floor: { pattern: "fuzzy", colour: 206 }, wall: { pattern: "plain", colour: 203 }
    },
    {
        level: 47, name: "The Studio Lot",
        seats: ["heartsofa5", "habbowood_chair", "wrapped_chair"],
        decoy: "c25_easter_chair", obstacle: "plant_big_cactus",
        tall: "shelves_armas", lamp: "hockey_light", plant: "plant_yukka",
        floor: { pattern: "tiles2", colour: 409 }, wall: { pattern: "color_stripes2", colour: 1601 }
    },
    {
        level: 48, name: "The Sports Bar",
        seats: ["fball_bench", "bar_chair_armas", "sandseat"],
        decoy: "small_chair_armas", obstacle: "bar_armas", poi: "cabin_bar_chair_armas",
        tall: "shelves_armas", lamp: "hockey_light",
        floor: { pattern: "fuzzy", colour: 201 }, wall: { pattern: "color_invaders", colour: 2301 }
    },
    {
        level: 49, name: "The Club Floor",
        seats: ["hcsohva", "hc_chr", "throne"],
        decoy: "chair_silo", obstacle: "hc_arab_snake", poi: "hc_arab_chair",
        tall: "shelves_silo", lamp: "hc_lmp", plant: "plant_bonsai",
        floor: { pattern: "tiles5", colour: 610 }, wall: { pattern: "half3", colour: 801 }
    }
];

module.exports = { THEMES, NEUTRAL };

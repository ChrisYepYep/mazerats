/* Fallin' Furni's sound (25 Oct 2026) — the soundtrack, its stings and the
   game's sound effects, all made live with the Web Audio API.

   ----------------------------------------------------------------------
   THE STYLE: A MEGA DRIVE, ALL OF IT

   The owner's brief: "a fun, catchy hook, some slap bass vibes like Sonic's
   Labyrinth Zone". The first version did that with two-operator FM — and
   sounded too like Scout's Trail, which is two-operator FM through and
   through ("use different instruments in that FM style. Closer to the sounds
   used in Sonic's Labyrinth Zone soundtrack, but still providing a cosy
   atmosphere").

   So this one is built from the parts of the Mega Drive that Scout never
   touches — the parts that make Sonic 1 sound like Sonic 1:

       the PSG      the console's second sound chip: three plain square waves
                    and a noise channel, with volume in 2dB steps that the
                    driver moves once a frame. Sonic doubles its FM tunes on
                    it an octave up, plays its hi-hats and crashes on its
                    noise, and runs its little arpeggios through it. The
                    stepped decay is the giveaway, and it is copied here.
       the DAC      the drums are SAMPLES on the real thing: an 8-bit kick, a
                    snare and three TIMPANI, played at about 11kHz. They are
                    made here once as 8-bit buffers at 11,025Hz, so they come
                    out with the same crunch. The timpani take the fills.
       the YM2612   FM with its operators CHAINED — a modulator modulating a
                    modulator — where Scout uses one modulator on its own. The
                    top of a chain can be a saw, standing in for the chip's
                    operator feedback, and the whole FM bus is rounded to ten
                    bits on the way out, which is the faint grain on the
                    console's own output.

   And for the cosy part: a VIBRAPHONE (FM bars with the motor's tremolo) on
   the verse and the bridge, a soft detuned string pad under the hook, the
   top taken off everything above 8.5kHz, and now and then a bubble —
   Labyrinth Zone is underwater.

   The slap bass is three sounds, the way a player's two hands make it:

       thumb   the root, low — round, with a sine underneath for weight
       pop     the octave (or the seventh) snapped up — brighter, a little
               sharp for its first few milliseconds as the string snaps back
       ghost   a dead, muted note: pitch barely there, almost a drum

   ----------------------------------------------------------------------
   THE TUNE

   Its own, in D Dorian at 116 beats a minute with a light shuffle on the
   sixteenths (the off ones land a little late). Fixed tempo — the owner's:
   it plays in rounds "but should not get faster".

       intro   two bars of bass and drums, the first time only
       A       the verse: the vibraphone's call, the bass answering in the gaps
       B       THE HOOK. Up three stairs (D F A) and a tumble back down —
               things falling, which is the game — a warm FM lead with the
               vibraphone an octave over it, the strings under, a timpani on
               the one
       A2      the verse again on the warm lead, the vibraphone answering in
               the gaps
       B       the hook
       C       the bridge: half-time, the vibraphone's chords, the warm lead
               and the vibraphone together, a vibraphone run falling through
               its last bar into a timpani roll
       B       the hook, and round to A

   WHAT WAS TAKEN OUT, AND WHY (25 Oct 2026, the owner's ears). A lead of
   chained FM with a saw on top, a PSG square doubling the hook, a "pipe"
   (chained FM on the octave — a kazoo, it turned out) on the second verse,
   PSG squares carrying the bridge, and a ten-bit grain on the whole bus.
   Each was a piece of the Mega Drive's sound and each was unbearable over
   headphones. What stays of the PSG is short and quiet and rounded off: the
   hats, the crash, the bubbles, the effects' blips.

   Forty-eight bars, about a minute and forty, so a long round does not hear
   the same eight bars over and over.

   AND THREE MORE VERSIONS OF IT (25 Oct 2026, the owner's), each a track of
   its own with its own tempo (see TRACKS):

       ambient   the LOBBY: "a dreamy ambient version of the theme" — the
                 verse and the bridge at 68, vibraphone and strings, an
                 arpeggio drifting up through held chords, a long reverb
       sad       the GAME OVER: the hook and the bridge at 72, the vibraphone
                 over the warm lead held low, strings, no drums
       win       THE WHOLE GAME FINISHED: in on a timpani roll, then the hook
                 in D MAJOR at 120 with the full band

   Between rounds and on the pause the theme plays from the next room — the
   top cut off at 750Hz and the volume down — and opens out when a round
   starts, as Pura Panic's does. Moving from one track to another fades the
   one playing out over half a second and brings the next in from its top.

   STINGS: a level cleared, a life lost, a life won, and the run over. They
   play on a bus of their own, so the muffle never catches them.

   ----------------------------------------------------------------------
   THE CLOCK

   The standard look-ahead: a timer wakes every 25ms and books the notes due
   in the next eighth of a second on the audio clock, which never drifts the
   way timers do. Music and sound effects can each be switched off, and stay
   off for that browser. Browsers make no sound until the page has been
   clicked or tapped, so nothing here starts by itself. */
(function () {
    "use strict";

    const STORE_MUSIC = "mazerats_ff_music";
    const STORE_SOUND = "mazerats_ff_sound";
    /* THE VOLUME (26 Oct 2026, the owner's): one slider, on the title and the
       pause menu, for the music and the effects together, 0-100 and 80 until
       it is moved. It turns the whole mix down after the glue, so the balance
       between the two is untouched, and it is heard as a square of the
       slider, which is how ears hear loudness: half way sounds half as loud
       rather than barely quieter. Music and Sound still switch each off. */
    const STORE_VOLUME = "mazerats_ff_volume";
    const DEFAULT_VOLUME = 80;
    const MUSIC_VOL = 0.4;
    const SOUND_VOL = 0.55;
    const MUFFLED_HZ = 750, OPEN_HZ = 20000;
    const MUFFLED_VOL = 0.55;          // of MUSIC_VOL
    const WARM_HZ = 6000;              // the top off everything, for the cosy

    const BPM = 116;
    const SIX = 15 / BPM;              // a sixteenth, in seconds
    const SWING = 0.16;                // of a sixteenth, on the off ones
    const FRAME = 1 / 60;              // the sound driver's tick

    // ---- notes
    const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    function midi(name) {
        const m = /^([A-G])(#|b)?(\d)$/.exec(name);
        if (!m) return null;
        return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    }
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

    /* A bar of melody as "D5:2 F5:2 .:4 …" — a note (or "." for a rest) and
       how many sixteenths it lasts. Out comes sixteen steps, each null or
       { note, len }. */
    /* `major` puts the tune in D MAJOR for the winning version: its three
       minor notes raised — F to F#, C to C#, Bb to B — and nothing else
       touched, so it is the same tune, brightened. */
    const MAJOR = { 5: 1, 0: 1, 10: 1 };
    function bar(text, major) {
        const out = new Array(16).fill(null);
        let at = 0;
        text.trim().split(/\s+/).forEach(tok => {
            const [name, n] = tok.split(":");
            const len = Number(n) || 1;
            let note = name === "." ? null : midi(name);
            if (note !== null && major && MAJOR[note % 12]) note += 1;
            if (note !== null) out[at] = { note, len };
            at += len;
        });
        if (at !== 16 && location.hostname === "localhost") console.warn("ff-audio: a bar of " + at + " sixteenths: " + text);
        return out;
    }

    /* ---- THE CHORDS. `root` is the thumb's note (A1 to G2, so the pops sit
       an octave up in the bass's sweet spot); `sev` is how far above it the
       chord's seventh is, for the "7" pop; `tones` the voicing the comping,
       pads and vibraphone play, kept between D4 and E5 so it never crowds
       the tune. */
    const CHORDS = {
        Dm7: { root: 38, sev: 10, tones: [65, 69, 72, 76] },
        G7: { root: 43, sev: 10, tones: [65, 71, 74] },
        Bbmaj7: { root: 34, sev: 11, tones: [62, 65, 69, 72] },
        A7: { root: 33, sev: 10, tones: [61, 64, 67, 70] },
        C: { root: 36, sev: 12, tones: [64, 67, 72] },
        Gm7: { root: 43, sev: 10, tones: [62, 65, 70] },
        C7: { root: 36, sev: 10, tones: [64, 67, 70] },
        Fmaj7: { root: 41, sev: 11, tones: [64, 69, 72] },
        Em7b5: { root: 40, sev: 10, tones: [62, 67, 70] },
        // The winning version's, in D major.
        Dmaj9: { root: 38, sev: 11, tones: [66, 69, 73, 76] },
        Gmaj7: { root: 43, sev: 11, tones: [66, 71, 74] },
        Amaj: { root: 33, sev: 12, tones: [61, 64, 69] },
        Em7: { root: 40, sev: 10, tones: [62, 66, 71] }
    };

    /* ANY OTHER CHORD, BY ITS NAME (25 Oct 2026, for the level-block tunes):
       "F#m7b5", "Ebmaj7", "Bbm6", "D7b9"… The root goes to the thumb's
       register (A1 to G#2), and the voicing is the chord's upper notes packed
       between D4 and C#5 — the same ground the hand-written ones above cover.
       `third` and `fifth` are there for the walking bass. Worked out once a
       name. The table above wins wherever it has the chord, so the approved
       theme is exactly as it was. */
    const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const QUALITY = {
        "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
        m7b5: [0, 3, 6, 10], dim: [0, 3, 6], "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], sus4: [0, 5, 7],
        "9": [0, 4, 7, 10, 14], "7b9": [0, 4, 7, 10, 13], add9: [0, 4, 7, 14], maj9: [0, 4, 7, 11, 14]
    };
    const chordCache = new Map();
    function chordOf(name) {
        if (CHORDS[name]) return CHORDS[name];
        let c = chordCache.get(name);
        if (c) return c;
        const m = /^([A-G])(#|b)?(.*)$/.exec(name);
        const iv = (m && QUALITY[m[3]]) || [0, 4, 7];
        const pc = m ? (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12 : 2;
        const root = 33 + ((pc - 9 + 12) % 12);
        const upper = iv.length > 3 ? iv.slice(1) : iv.slice(1).concat([12]);
        const tones = upper.map(i => 62 + ((((pc + i) - 62) % 12) + 12) % 12).sort((a, b) => a - b);
        const sev = iv.includes(10) ? 10 : iv.includes(11) ? 11 : 12;
        const third = iv.includes(3) ? 3 : iv.includes(5) ? 5 : 4;
        const fifth = iv.includes(6) ? 6 : 7;
        c = { root, sev, third, fifth, tones };
        chordCache.set(name, c);
        return c;
    }

    /* ---- THE BASS, a sixteenth a character:
           T thumb on the root      O pop the octave      7 pop the seventh
           5 thumb the fifth        g a ghost note        - hold    . rest
           a the semitone under the NEXT bar's root, u the one over it —
             the chromatic step a bass player walks into a chord change on
           P a soft root held for as long as its dashes say — the slow
             versions' bass, no slap in it at all
           F f 3 FINGERED, not slapped (the level-block tunes): the root, the
             fifth, the third; w the semitone under the next bar's root, the
             walking bass's step into it */
    const BASS = {
        held: "P---------------",
        quarters: "F---f---F---f---",
        bossa: "F-----f-F-----f-",
        disco: "T.O.T.O.T.O.T.O.",
        calypso: "F--F--f-F--F--f-",
        walk: "F---3---f---w---",
        folk: "F-------f-------",
        pump: "T..OT..OT..OT.O.",
        groove: "T-gOT.gOT-gO7gOg",
        push: "T-gO.gTOT-gO5-Oa",
        hold: "T--O.gT-T--OgOT.",
        fill: "T-O-7-O-5-O-T-ua",
        hook: "T--gOgT-.gT-OgOg",
        hookPush: "T--gOgT-.gT-O-5a",
        bridge: "T---.gO-T---.gOa",
        bridge2: "T---.gO-T-5-7-O-"
    };

    /* ---- THE DRUMS, a lane each:
           kick K (the DAC)      snare S, ghost g, C the snare with a burst
                                 of PSG noise on it for the hook's backbeat
           hat  H accented, h closed, o open — PSG noise, the way Sonic's are
           extra T a timpani (pitched by where it falls: high to low, furni
                 coming down the stairs), R a timpani roll, B a bubble */
    const DRUMS = {
        intro: { kick: "K......K..K.....", snare: "................", hat: "HhHhHhHhHhHhHhHh", extra: "........B......." },
        funk: { kick: "K......K..K.....", snare: "....S.......S..g", hat: "HhHhHhHhHhHhHhoh", extra: "................" },
        hook: { kick: "K.....K.K..K....", snare: "....C.......C...", hat: "HhHhHhHhHhHhHhoh", extra: "................" },
        bridge: { kick: "K.........K.....", snare: "........S.......", hat: "H.h.H.h.H.h.H.h.", extra: "......B........." },
        fill: { kick: "K......K........", snare: "....S...S.g.....", hat: "HhHhHhHh........", extra: "............TTTT" },
        rollFill: { kick: "K...............", snare: "................", hat: "H.h.H.h.........", extra: "........R......." },
        none: { kick: "................", snare: "................", hat: "................", extra: "................" },
        // The winning version's first bar: a timpani roll the length of it.
        winIn: { kick: "................", snare: "................", hat: "................", extra: "R..............." },
        /* The level-block tunes' (25 Oct 2026). r on the snare lane is a rim
           click; Q on the extra lane a timpani on the bar's own root. */
        softFill: { kick: "K.......K.......", snare: "........g.g.g.g.", hat: "..h...h.........", extra: "............TTTT" },
        gothic: { kick: "K.......K.......", snare: "....g.......g...", hat: "..h...h...h...h.", extra: "................" },
        garden: { kick: "K.........K.....", snare: "................", hat: "..h...h...h...h.", extra: "Q..............." },
        bossa: { kick: "K.....K.K.....K.", snare: "r..r..r...r..r..", hat: "h.h.h.h.h.h.h.h.", extra: "................" },
        disco: { kick: "K...K...K...K...", snare: "....C.......C...", hat: "h.o.h.o.h.o.h.o.", extra: "................" },
        calypso: { kick: "K...K...K...K...", snare: "..r..r..r...r...", hat: "hhhhhhhhhhhhhhhh", extra: "................" },
        swing: { kick: "K.......K.......", snare: "....g.......g...", hat: "H...H..hH...H..h", extra: "................" },
        doumbek: { kick: "K.......K.......", snare: "..r...r.....r...", hat: "....h.......h..h", extra: "Q.......Q......." },
        folk: { kick: "K.......K.......", snare: "........g.......", hat: "..h...h...h...h.", extra: "................" },
        club: { kick: "K...K...K...K...", snare: "....C.......C...", hat: "hhohhhohhhohhhoh", extra: "................" },
        epic: { kick: "K.......K.......", snare: "........S.......", hat: "................", extra: "Q..............." },
        // The four builder's tunes': the city, the meeting, China, the ballad.
        hiphop: { kick: "K......K..K..K..", snare: "....S.......S...", hat: "h.h.h.h.h.h.h.o.", extra: "................" },
        office: { kick: "K.......K.K.....", snare: "....r.......r...", hat: "h.h.h.h.h.h.h.h.", extra: "................" },
        temple: { kick: "K...............", snare: ".r...r.r....r...", hat: "................", extra: "Q.......Q......." },
        ballad: { kick: "K.......K.......", snare: "........g.......", hat: "h...h...h...h...", extra: "................" }
    };
    const TIMPS = [147, 110, 87, 73];       // D3 A2 F2 D2

    /* ---- THE CHORD PARTS: c a chained-FM electric piano stab, v the
       vibraphone, p the string pad held for the bar, "-" holding the one
       before; a ONE vibraphone note of the chord, an octave up, the next
       each time — an arpeggio climbing slowly through the bar. */
    const COMP = {
        funk: ["......c.......c.", null],
        hook: ["p---------------", null],
        bridge: ["v-------v-------", null],
        drift: ["p---------------", "a...a...a...a..."],
        lament: ["p---------------", "v-------v-------"],
        /* The level-block tunes': o an organ chord held, k ONE plucked note
           of the chord, the next each time (a guitar or a harp picking). */
        organ: ["o---------------", null],
        organArp: ["o---------------", "a...a...a...a..."],
        bossa: ["c..c..c...c.c...", null],
        skank: ["..c...c...c...c.", null],
        arps8: ["p---------------", "a.a.a.a.a.a.a.a."],
        pick: ["k.k.k.k.k.k.k.k.", null],
        pickPad: ["p---------------", "k.k.k.k.k.k.k.k."],
        pad: ["p---------------", null],
        epic: ["p---------------", "v-------v-------"]
    };

    // ---- THE TUNE
    const VERSE = [
        ".:4 A4:1 .:1 C5:1 D5:3 .:2 F5:1 E5:1 D5:2",
        "C5:2 A4:2 .:12",
        ".:4 B4:1 .:1 D5:1 F5:3 .:2 A5:1 G5:1 F5:2",
        "E5:2 D5:2 .:12",
        ".:4 A4:1 .:1 C5:1 D5:3 .:2 F5:1 E5:1 D5:2",
        "F5:2 G5:2 A5:4 .:2 G5:1 F5:1 D5:2 .:2",
        "D5:3 F5:3 A5:2 C6:4 A5:2 F5:2",
        "E5:2 C#5:2 A4:2 G4:2 .:2 E4:1 G4:1 A4:2 C#5:2"
    ];
    // The PSG's answers in the gaps of the second verse.
    const ANSWERS = [
        null,
        ".:8 D6:1 A5:1 F5:1 D5:1 .:4",
        null,
        ".:8 F6:1 D6:1 B5:1 G5:1 .:4",
        null,
        null,
        null,
        null
    ];
    const HOOK = [
        "D5:2 F5:2 A5:3 G5:1 .:2 F5:2 E5:2 F5:2",
        "C6:2 A5:1 G5:1 F5:2 D5:2 .:2 C5:2 D5:4",
        "E5:2 G5:2 C6:3 Bb5:1 .:2 A5:2 G5:2 E5:2",
        "F5:2 E5:2 C#5:2 E5:2 A5:6 .:2",
        "D5:2 F5:2 A5:3 G5:1 .:2 F5:2 E5:2 F5:2",
        "C6:2 A5:1 G5:1 F5:2 D5:2 .:2 C5:2 D5:4",
        "Bb5:2 A5:2 G5:2 F5:2 E5:2 F5:2 G5:2 A5:2",
        "C#6:3 A5:1 G5:2 E5:2 C#5:2 A4:2 .:4"
    ];
    const BRIDGE = [
        "D5:6 C5:2 Bb4:4 A4:2 G4:2",
        "E5:6 D5:2 C5:4 Bb4:2 G4:2",
        "A5:6 G5:2 F5:4 E5:2 C5:2",
        "D5:8 F5:4 A5:4",
        "G5:6 F5:2 E5:4 D5:2 Bb4:2",
        "C#5:4 E5:4 G5:4 A5:4",
        "F5:3 E5:3 D5:2 A4:8",
        "A5:1 G5:1 F5:1 E5:1 D5:1 C#5:1 Bb4:1 A4:1 G4:2 E4:2 C#4:2 .:2"
    ];

    const SECTIONS = {
        intro: {
            chords: ["Dm7", "Dm7"], bass: ["groove", "fill"], drums: ["intro", "fill"],
            comp: null, lead: null, voice: null
        },
        A: {
            chords: ["Dm7", "Dm7", "G7", "G7", "Dm7", "Dm7", "Bbmaj7", "A7"],
            bass: ["groove", "push", "groove", "push", "groove", "push", "hold", "fill"],
            drums: "funk", comp: "funk", lead: VERSE, voice: "vibes", bubbles: true
        },
        A2: {
            chords: ["Dm7", "Dm7", "G7", "G7", "Dm7", "Dm7", "Bbmaj7", "A7"],
            bass: ["groove", "push", "groove", "push", "groove", "push", "hold", "fill"],
            drums: "funk", comp: "funk", lead: VERSE, voice: "warm", answers: ANSWERS
        },
        B: {
            chords: ["Dm7", "Bbmaj7", "C", "A7", "Dm7", "Bbmaj7", "Gm7", "A7"],
            bass: ["hook", "hookPush", "hook", "hookPush", "hook", "hookPush", "hook", "fill"],
            drums: "hook", comp: "hook", lead: HOOK, voice: "hook", crash: true
        },
        C: {
            chords: ["Gm7", "C7", "Fmaj7", "Bbmaj7", "Em7b5", "A7", "Dm7", "A7"],
            bass: ["bridge", "bridge2", "bridge", "bridge2", "bridge", "bridge2", "bridge", "fill"],
            drums: "bridge", comp: "bridge", lead: BRIDGE, voice: "soft", crash: true, fall: true, roll: true
        },

        /* THE LOBBY'S DRIFT (the owner's, 25 Oct 2026: "a dreamy ambient
           version of the theme"): the verse and then the bridge, slow, on
           the vibraphone with a breath of strings under each note, the
           chords held as pads with an arpeggio climbing through them, a soft
           held bass, the odd bubble, no drums — and a long reverb on all of
           it (the track's `wash`). */
        AMB_A: {
            chords: ["Dm7", "Dm7", "G7", "G7", "Dm7", "Dm7", "Bbmaj7", "A7"],
            bass: "held", drums: null, comp: "drift", lead: VERSE, voice: "dream", bubbles: true, compVol: 0.8
        },
        AMB_C: {
            chords: ["Gm7", "C7", "Fmaj7", "Bbmaj7", "Em7b5", "A7", "Dm7", "A7"],
            bass: "held", drums: null, comp: "drift", lead: BRIDGE, voice: "dream", bubbles: true, compVol: 0.8
        },

        /* THE LAMENT, for the game over (the owner's: "a slow/sad version"):
           the hook and then the bridge, slowly, on the vibraphone over the
           warm lead held low, strings and soft vibraphone chords, the bass a
           long note a bar. No drums. */
        SAD_B: {
            chords: ["Dm7", "Bbmaj7", "C", "A7", "Dm7", "Bbmaj7", "Gm7", "A7"],
            bass: "held", drums: null, comp: "lament", lead: HOOK, voice: "sad", compVol: 0.7
        },
        SAD_C: {
            chords: ["Gm7", "C7", "Fmaj7", "Bbmaj7", "Em7b5", "A7", "Dm7", "A7"],
            bass: "held", drums: null, comp: "lament", lead: BRIDGE, voice: "sad", compVol: 0.7
        },

        /* THE WIN, for finishing every level (the owner's: "a winning
           version"): the hook in D MAJOR, bright chords under it, the full
           band, a crash and a timpani every four bars; in on a timpani roll. */
        WIN_IN: {
            chords: ["Dmaj9"], bass: ["fill"], drums: ["winIn"], comp: null, lead: null, voice: null
        },
        WIN_B: {
            chords: ["Dmaj9", "Gmaj7", "Amaj", "A7", "Dmaj9", "Gmaj7", "Em7", "A7"],
            bass: ["hook", "hookPush", "hook", "hookPush", "hook", "hookPush", "hook", "fill"],
            drums: "hook", comp: "hook", lead: HOOK, voice: "hook", major: true, crash: true, crashEvery: 4
        }
    };
    const LOOP = ["A", "B", "A2", "B", "C", "B"];

    /* ---- THE LEVEL-BLOCK TUNES (25 Oct 2026, the owner's: "have the
       soundtrack change every 5 levels … varying in tune, theme, melody",
       and "Level 50 should be an epic version of the main theme"). Each its
       own key, chords and melody, a verse (_A) and a chorus (_B), each eight
       bars, played A B A B with the second verse on another voice. The
       characters come from the rooms the levels are built in. */
    const LEVEL_SECTIONS = {
        // 6-10, the gothic rooms: a music box in E minor over an organ.
        GOT_A: {
            chords: ["Em", "C", "Am", "B7", "Em", "C", "Am", "B7"],
            bass: "quarters", drums: "gothic", fill: "softFill", comp: "organ", voice: "vibes",
            lead: ["E5:6 G5:2 B5:4 A5:2 G5:2", "E5:6 G5:2 C6:4 B5:2 A5:2", "A5:6 C6:2 E6:4 D6:2 C6:2", "B5:8 D#5:4 F#5:4",
                "E5:6 G5:2 B5:4 A5:2 G5:2", "G5:3 F#5:1 E5:4 C6:4 B5:4", "A5:4 C6:4 B5:2 A5:2 G5:2 F#5:2", "F#5:4 D#5:4 B4:8"]
        },
        GOT_B: {
            chords: ["Am", "Em", "C", "B7", "Am", "Em", "F#m7b5", "B7"],
            bass: "quarters", drums: "gothic", fill: "softFill", comp: "organArp", voice: "dream", crash: true,
            lead: ["C6:2 B5:2 A5:2 E5:2 A5:4 B5:2 C6:2", "B5:2 A5:2 G5:2 E5:2 G5:4 A5:2 B5:2", "C6:2 D6:2 E6:4 D6:2 C6:2 B5:4", "A5:2 B5:2 F#5:4 D#5:8",
                "C6:2 B5:2 A5:2 E5:2 A5:4 B5:2 C6:2", "B5:2 A5:2 G5:2 E5:2 G5:4 A5:2 B5:2", "A5:4 C6:4 E6:2 D6:2 C6:2 A5:2", "B5:4 A5:2 G5:2 F#5:4 D#5:4"]
        },
        // 11-15, the halls and the night lotus: a garden at night, A minor pentatonic.
        LOT_A: {
            chords: ["Am", "G", "F", "G", "Am", "G", "Em", "Am"],
            bass: "held", drums: "garden", fill: false, comp: "drift", voice: "pluck",
            lead: ["E5:3 D5:1 C5:2 D5:2 E5:4 G5:2 E5:2", "D5:4 C5:2 A4:2 G4:4 A4:4", "C5:3 D5:1 E5:2 G5:2 A5:4 G5:2 E5:2", "G5:8 E5:4 D5:4",
                "E5:3 D5:1 C5:2 D5:2 E5:4 G5:2 A5:2", "C6:4 A5:2 G5:2 E5:4 D5:4", "E5:2 G5:2 A5:4 G5:2 E5:2 D5:4", "A4:12 .:4"]
        },
        LOT_B: {
            chords: ["F", "G", "Em", "Am", "Dm", "Em", "F", "G"],
            bass: "held", drums: "garden", fill: false, comp: "pad", voice: "flute", bubbles: true,
            lead: ["A5:6 G5:2 E5:4 D5:4", "G5:6 E5:2 D5:4 C5:4", "E5:4 G5:4 D6:4 C6:2 A5:2", "A5:12 G5:2 E5:2",
                "D5:4 F5:4 A5:4 C6:4", "B5:6 A5:2 G5:4 E5:4", "A5:4 G5:2 F5:2 E5:4 D5:4", "E5:4 D5:4 C5:4 D5:4"]
        },
        // 16-20, the lounges: bossa nova in F.
        BOS_A: {
            chords: ["Fmaj7", "Fmaj7", "Gm7", "C7", "Am7", "D7", "Gm7", "C7"],
            bass: "bossa", drums: "bossa", fill: false, comp: "bossa", compVol: 0.55, voice: "warm",
            lead: [".:2 A5:2 G5:2 A5:4 C6:2 .:2 A5:2", "G5:6 E5:2 F5:4 .:4", ".:2 Bb5:2 A5:2 Bb5:4 D6:2 .:2 Bb5:2", "A5:6 G5:2 E5:4 .:4",
                ".:2 C6:2 B5:2 C6:4 E6:2 .:2 C6:2", "D6:4 C6:2 A5:2 F#5:4 .:4", "G5:2 A5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:2", "G5:8 E5:4 C5:4"]
        },
        BOS_B: {
            chords: ["Bbmaj7", "Bbm6", "Am7", "D7b9", "Gm7", "C7", "Fmaj7", "C7"],
            bass: "bossa", drums: "bossa", fill: false, comp: "bossa", compVol: 0.55, voice: "vibes",
            lead: ["D6:6 C6:2 A5:4 F5:4", "C#6:6 C6:2 G5:4 F5:4", "C6:4 B5:2 A5:2 E5:4 G5:4", "F#5:4 A5:2 C6:2 D#6:4 D6:4",
                "D6:2 C6:2 Bb5:2 A5:2 G5:4 F5:4", "E5:2 G5:2 Bb5:2 D6:2 C6:8", "A5:4 C6:4 E6:4 C6:4", "Bb5:4 G5:4 E5:4 C5:4"]
        },
        // 21-25, Pura, Polyfon and Plasto: retro disco in G.
        DIS_A: {
            chords: ["Gmaj7", "Em7", "Am7", "D7", "Gmaj7", "Em7", "Am7", "D7"],
            bass: "disco", drums: "disco", comp: "skank", compVol: 0.6, voice: "hook",
            lead: ["B5:2 .:2 B5:2 D6:2 .:2 B5:2 A5:2 G5:2", "A5:4 G5:2 E5:2 .:4 G5:2 A5:2", "C6:2 .:2 C6:2 E6:2 .:2 C6:2 B5:2 A5:2", "B5:4 A5:2 F#5:2 .:4 D5:2 F#5:2",
                "B5:2 .:2 B5:2 D6:2 .:2 B5:2 A5:2 G5:2", "A5:4 G5:2 E5:2 .:4 G5:2 A5:2", "C6:2 .:2 C6:2 E6:2 .:2 C6:2 B5:2 A5:2", "A5:2 B5:2 C6:2 D6:2 E6:4 .:4"]
        },
        DIS_B: {
            chords: ["Cmaj7", "Bm7", "Am7", "D7", "Cmaj7", "Bm7", "Em7", "D7"],
            bass: "disco", drums: "disco", comp: "pad", voice: "lush", crash: true, crashEvery: 4,
            lead: ["E6:4 D6:2 B5:2 G5:4 E5:4", "D6:4 C6:2 A5:2 F#5:4 D5:4", "C6:2 B5:2 A5:2 G5:2 E5:4 G5:4", "A5:8 .:4 D5:2 E5:2",
                "G5:2 E5:2 G5:2 B5:2 E6:4 D6:4", "C6:2 B5:2 A5:2 F#5:2 D6:4 B5:4", "G5:4 B5:4 E6:4 D6:4", "C6:4 A5:4 F#5:4 D5:4"]
        },
        // 26-30, the forest, the pods and the summer rooms: calypso in C.
        CAL_A: {
            chords: ["C", "F", "G7", "C", "C", "F", "G7", "C"],
            bass: "calypso", drums: "calypso", comp: "skank", compVol: 0.5, voice: "steel",
            lead: ["E5:2 G5:1 E5:1 .:2 C5:2 E5:2 G5:2 .:2 E5:2", "F5:2 A5:1 F5:1 .:2 C5:2 F5:2 A5:2 .:2 C6:2", "B5:2 D6:1 B5:1 .:2 G5:2 F5:2 D5:2 .:2 B4:2", "C5:4 E5:2 G5:2 C6:6 .:2",
                "E5:2 G5:1 E5:1 .:2 C5:2 E5:2 G5:2 .:2 E5:2", "F5:2 A5:1 F5:1 .:2 C5:2 F5:2 A5:2 .:2 C6:2", "B5:2 D6:1 B5:1 .:2 G5:2 F5:2 D5:2 .:2 B4:2", "C6:2 G5:2 E5:2 D5:2 C5:6 .:2"]
        },
        CAL_B: {
            chords: ["Am", "F", "C", "G7", "Am", "F", "Dm7", "G7"],
            bass: "calypso", drums: "calypso", comp: "skank", compVol: 0.5, voice: "marimba",
            lead: ["A5:3 G5:1 A5:2 C6:2 .:2 A5:2 E5:4", "F5:3 E5:1 F5:2 A5:2 .:2 F5:2 C5:4", "E5:3 D5:1 E5:2 G5:2 .:2 C6:2 G5:4", "B5:4 A5:2 G5:2 F5:4 D5:4",
                "A5:3 G5:1 A5:2 C6:2 .:2 E6:2 D6:4", "C6:3 A5:1 F5:2 A5:2 .:2 C6:2 A5:4", "F5:2 A5:2 D6:2 C6:2 A5:4 F5:4", "G5:2 F5:2 D5:2 B4:2 G4:4 .:4"]
        },
        // 31-35, the bar, the cabin and the suites: a smoky jazz bar in Bb.
        JAZ_A: {
            chords: ["Bbmaj7", "G7", "Cm7", "F7", "Dm7", "G7", "Cm7", "F7"],
            bass: "walk", drums: "swing", fill: "softFill", comp: "funk", compVol: 0.6, voice: "vibes",
            lead: ["D5:3 F5:1 A5:4 G5:2 F5:2 D5:4", "B4:2 D5:2 F5:2 A5:2 G5:8", "Eb5:3 G5:1 Bb5:4 A5:2 G5:2 Eb5:4", "F5:4 A5:2 C6:2 Eb6:4 D6:4",
                "F5:3 A5:1 C6:4 B5:2 A5:2 F5:4", "D5:2 F5:2 A5:2 B5:2 D6:8", "C6:2 Bb5:2 G5:2 Eb5:2 F5:2 G5:2 A5:2 Bb5:2", "C6:8 A5:4 F5:4"]
        },
        JAZ_B: {
            chords: ["Ebmaj7", "Ebm6", "Dm7", "G7", "Cm7", "F7", "Bbmaj7", "F7"],
            bass: "walk", drums: "swing", fill: "softFill", comp: "funk", compVol: 0.6, voice: "warm",
            lead: ["G5:6 Bb5:2 D6:4 C6:4", "Gb5:6 Bb5:2 C6:4 Bb5:4", "F5:4 A5:4 C6:4 A5:4", "B5:4 A5:2 G5:2 F5:4 D5:4",
                "Eb5:2 G5:2 Bb5:2 D6:2 C6:8", "A5:2 C6:2 Eb6:2 C6:2 A5:4 F5:4", "D6:4 C6:2 Bb5:2 A5:4 F5:4", "G5:2 A5:2 Bb5:2 C6:2 D6:4 .:4"]
        },
        // 36-40, Arabian Nights to Damaged Goods: D phrygian dominant, oud and ney.
        ARA_A: {
            chords: ["D", "D", "Cm", "D", "Gm", "Eb", "D", "D"],
            bass: "held", drums: "doumbek", fill: false, comp: "pad", compVol: 0.7, voice: "pluck",
            lead: ["D5:2 Eb5:2 F#5:2 G5:2 A5:4 G5:2 F#5:2", "G5:2 F#5:2 Eb5:2 F#5:2 D5:8", "C5:2 D5:2 Eb5:2 G5:2 Eb5:4 D5:4", "D5:2 F#5:2 A5:2 C6:2 Bb5:4 A5:4",
                "Bb5:2 A5:2 G5:2 A5:2 Bb5:4 D6:4", "C6:2 Bb5:2 G5:2 Bb5:2 G5:8", "A5:2 Bb5:2 A5:2 G5:2 F#5:2 G5:2 F#5:2 Eb5:2", "D5:12 .:4"]
        },
        ARA_B: {
            chords: ["Gm", "Cm", "D", "D", "Gm", "Eb", "Cm", "D"],
            bass: "held", drums: "doumbek", fill: false, comp: "pad", compVol: 0.7, voice: "flute",
            lead: ["D6:8 C6:4 Bb5:4", "C6:6 Bb5:2 G5:8", "A5:4 Bb5:2 A5:2 G5:4 F#5:4", "F#5:2 G5:2 A5:12",
                "Bb5:8 A5:4 G5:4", "G5:6 F5:2 Eb5:8", "Eb5:4 D5:4 C5:4 Eb5:4", "D5:16"]
        },
        // 41-45, the lawn, the temple, the lodge and the terrace: autumn folk in G.
        FOL_A: {
            chords: ["G", "D", "Em", "C", "G", "D", "C", "D"],
            bass: "folk", drums: "folk", fill: "softFill", comp: "pick", compVol: 0.8, voice: "flute",
            lead: ["D5:4 G5:4 B5:6 A5:2", "A5:4 F#5:4 D5:8", "E5:4 G5:4 B5:4 A5:2 G5:2", "G5:6 E5:2 C5:8",
                "D5:4 G5:4 B5:4 D6:4", "C6:4 B5:2 A5:2 F#5:4 D5:4", "E5:4 G5:2 C6:2 B5:4 A5:4", "A5:6 G5:2 F#5:8"]
        },
        FOL_B: {
            chords: ["C", "G", "Am", "D", "C", "G", "Em", "D"],
            bass: "folk", drums: "folk", fill: "softFill", comp: "pickPad", compVol: 0.8, voice: "warm",
            lead: ["E5:2 G5:2 C6:4 B5:2 A5:2 G5:4", "B4:2 D5:2 G5:4 F#5:2 E5:2 D5:4", "C5:2 E5:2 A5:4 G5:2 F#5:2 E5:4", "F#5:4 A5:4 D6:8",
                "E6:4 D6:2 C6:2 G5:4 E5:4", "D6:4 B5:2 G5:2 D5:4 G5:4", "B5:4 A5:2 G5:2 E5:4 G5:4", "A5:4 B5:2 A5:2 F#5:4 D5:4"]
        },
        // 46-49, the studio, the sports bar and the club floor: the run's last push, E minor.
        CLU_A: {
            chords: ["Em", "C", "G", "D", "Em", "C", "G", "D"],
            bass: "pump", drums: "club", comp: "arps8", compVol: 0.8, voice: "hook",
            lead: ["B5:2 .:2 E6:2 .:2 D6:2 B5:2 G5:2 .:2", "E5:2 .:2 G5:2 .:2 C6:4 B5:2 G5:2", "D6:2 .:2 B5:2 .:2 G5:2 A5:2 B5:4", "A5:4 F#5:4 D5:4 .:4",
                "B5:2 .:2 E6:2 .:2 D6:2 B5:2 G5:2 .:2", "E5:2 .:2 G5:2 .:2 C6:4 B5:2 G5:2", "D6:2 .:2 B5:2 .:2 G5:2 A5:2 B5:4", "A5:2 B5:2 C6:2 D6:2 E6:8"]
        },
        CLU_B: {
            chords: ["Am", "Em", "C", "D", "Am", "Em", "C", "B7"],
            bass: "pump", drums: "club", comp: "arps8", compVol: 0.8, voice: "lush", crash: true, crashEvery: 4,
            lead: ["C6:6 B5:2 A5:4 E5:4", "B5:6 A5:2 G5:4 E5:4", "G5:4 A5:4 B5:4 C6:4", "D6:8 C6:4 A5:4",
                "E6:6 D6:2 C6:4 A5:4", "B5:6 C6:2 B5:4 G5:4", "E5:4 G5:4 C6:4 E6:4", "D#6:8 B5:4 F#5:4"]
        },
        /* 50, THE LIBRARY, the last level: the main theme made epic — the
           hook and the bridge at 96, the tune doubled an octave down and on
           the strings, timpani on every bar, a roll into it. */
        EPIC_IN: {
            chords: ["Dm7", "Dm7"], bass: "held", drums: ["winIn", "winIn"], comp: "pad", compVol: 1.2, voice: null, lead: null
        },
        EPIC_B: {
            chords: ["Dm7", "Bbmaj7", "C", "A7", "Dm7", "Bbmaj7", "Gm7", "A7"],
            bass: "held", drums: "epic", comp: "epic", compVol: 1.2, lead: HOOK, voice: "epic", crash: true, crashEvery: 4
        },
        EPIC_C: {
            chords: ["Gm7", "C7", "Fmaj7", "Bbmaj7", "Em7b5", "A7", "Dm7", "A7"],
            bass: "held", drums: "epic", comp: "epic", compVol: 1.2, lead: BRIDGE, voice: "epic", crash: true, crashEvery: 4, roll: true
        }
    };
    /* ---- FOUR MORE, for the builder to give any level (25 Oct 2026, the
       owner's: "urban city, business meeting, ancient chinese, romantic love
       song - don't assign these to any levels"). Nothing plays them unless a
       level's `music` names them. */
    Object.assign(LEVEL_SECTIONS, {
        // URBAN CITY: C minor, a slapped groove under a laid-back hip-hop beat.
        CIT_A: {
            chords: ["Cm7", "Abmaj7", "Fm7", "G7", "Cm7", "Abmaj7", "Fm7", "G7"],
            bass: "groove", drums: "hiphop", fill: false, comp: "funk", compVol: 0.7, voice: "warm",
            lead: ["G5:2 .:1 Eb5:1 G5:2 Bb5:2 .:2 G5:2 F5:2 Eb5:2", "C5:3 Eb5:1 .:4 G5:2 Ab5:2 G5:2 Eb5:2",
                "F5:2 .:1 Ab5:1 C6:2 Bb5:2 .:2 Ab5:2 G5:2 F5:2", "D5:4 F5:2 G5:2 B4:4 .:4",
                "G5:2 .:1 Eb5:1 G5:2 Bb5:2 .:2 G5:2 F5:2 Eb5:2", "C5:3 Eb5:1 .:4 Bb5:2 C6:2 Bb5:2 G5:2",
                "Ab5:2 G5:2 F5:2 Eb5:2 F5:2 G5:2 Ab5:2 B5:2", "C6:6 G5:2 .:8"]
        },
        CIT_B: {
            chords: ["Abmaj7", "Bb7", "Gm7", "Cm7", "Fm7", "Bb7", "Ebmaj7", "G7"],
            bass: "groove", drums: "hiphop", fill: false, comp: "pad", compVol: 0.8, voice: "vibes",
            lead: ["Eb6:4 C6:2 Ab5:2 Eb5:4 G5:4", "F5:2 Ab5:2 D6:4 C6:2 Bb5:2 Ab5:4", "G5:6 Bb5:2 D6:4 Bb5:4", "C6:8 .:4 Eb5:2 G5:2",
                "Ab5:4 C6:4 Eb6:4 C6:4", "D6:2 C6:2 Bb5:2 Ab5:2 F5:4 D5:4", "Eb5:2 G5:2 Bb5:2 D6:2 Eb6:4 D6:4", "B5:4 G5:2 F5:2 D5:4 B4:4"]
        },
        // BUSINESS MEETING: Eb major, the lift-music jazz of a conference
        // room — marimba over a walking bass and electric piano.
        OFF_A: {
            chords: ["Ebmaj7", "Cm7", "Fm7", "Bb7", "Ebmaj7", "Cm7", "Fm7", "Bb7"],
            bass: "walk", drums: "office", fill: "softFill", comp: "bossa", compVol: 0.5, voice: "marimba",
            lead: ["G5:2 Bb5:2 Eb6:2 D6:2 Bb5:4 G5:4", "Eb5:2 G5:2 C6:2 Bb5:2 G5:4 .:4", "Ab5:2 C6:2 F6:2 Eb6:2 C6:4 Ab5:4", "F5:2 Ab5:2 D6:2 C6:2 Bb5:8",
                "G5:2 Bb5:2 Eb6:2 D6:2 Bb5:4 G5:4", "Eb5:2 G5:2 C6:2 D6:2 Eb6:4 .:4", "F6:2 Eb6:2 C6:2 Ab5:2 D6:2 C6:2 Bb5:2 Ab5:2", "G5:8 Eb5:4 .:4"]
        },
        OFF_B: {
            chords: ["Abmaj7", "Bb7", "Gm7", "Cm7", "Fm7", "Bb7", "Ebmaj7", "Bb7"],
            bass: "walk", drums: "office", fill: "softFill", comp: "pad", compVol: 0.6, voice: "lush",
            lead: ["C6:6 Bb5:2 Ab5:4 Eb5:4", "D6:6 C6:2 Bb5:4 F5:4", "Bb5:4 D6:4 F6:4 D6:4", "Eb6:8 C6:4 G5:4",
                "Ab5:4 C6:4 Eb6:4 Ab5:4", "Bb5:4 D6:2 C6:2 Bb5:4 Ab5:4", "G5:2 Bb5:2 Eb6:4 D6:2 Eb6:2 G5:4", "F5:4 G5:2 Ab5:2 Bb5:4 D5:4"]
        },
        // ANCIENT CHINA: E minor pentatonic, a plucked zither over a held
        // bass, a woodblock and a deep drum; the flute takes the chorus.
        DYN_A: {
            chords: ["Em", "Em", "G", "D", "Em", "C", "D", "Em"],
            bass: "held", drums: "temple", fill: false, comp: "pick", compVol: 0.7, voice: "pluck",
            lead: ["E5:3 G5:1 A5:4 B5:2 A5:2 G5:4", "E5:4 D5:2 E5:2 G5:8", "B5:3 D6:1 B5:2 A5:2 G5:4 A5:4", "D5:6 E5:2 A4:8",
                "E5:3 G5:1 A5:4 B5:2 D6:2 E6:4", "D6:4 B5:2 A5:2 G5:4 E5:4", "A5:2 B5:2 A5:2 G5:2 E5:4 D5:4", "E5:12 .:4"]
        },
        DYN_B: {
            chords: ["C", "D", "Bm", "Em", "C", "D", "Em", "Em"],
            bass: "held", drums: "temple", fill: false, comp: "pickPad", compVol: 0.7, voice: "flute",
            lead: ["G5:8 A5:4 B5:4", "A5:6 G5:2 E5:4 D5:4", "D5:4 E5:4 B5:6 A5:2", "B5:12 .:4",
                "E6:6 D6:2 B5:4 A5:4", "A5:4 B5:2 A5:2 G5:4 E5:4", "D5:2 E5:2 G5:2 A5:2 B5:4 D6:4", "E6:12 .:4"]
        },
        // A LOVE SONG: F major, a slow ballad — the warm lead over a pad and
        // vibraphone, the strings and a harp's picking for the chorus.
        LOV_A: {
            chords: ["Fmaj7", "Am7", "Bbmaj7", "C7", "Fmaj7", "Dm7", "Gm7", "C7"],
            bass: "folk", drums: "ballad", fill: false, comp: "lament", compVol: 0.8, voice: "warm",
            lead: ["A5:4 G5:2 F5:2 C5:8", "E5:4 F5:2 G5:2 A5:8", "D6:4 C6:2 Bb5:2 F5:6 G5:2", "G5:12 .:4",
                "A5:4 G5:2 F5:2 C6:8", "D6:4 C6:2 A5:2 F5:8", "Bb5:4 A5:2 G5:2 D5:4 E5:4", "F5:12 .:4"]
        },
        LOV_B: {
            chords: ["Bbmaj7", "C", "Am7", "Dm7", "Gm7", "C7", "Fmaj7", "C7"],
            bass: "folk", drums: "ballad", fill: "softFill", comp: "pickPad", compVol: 0.8, voice: "lush",
            lead: ["D6:6 C6:2 Bb5:4 F5:4", "E6:6 D6:2 C6:4 G5:4", "C6:6 A5:2 E5:4 G5:4", "F5:4 A5:4 D6:8",
                "D6:4 C6:2 Bb5:2 G5:4 Bb5:4", "C6:4 Bb5:2 A5:2 G5:4 E5:4", "F5:2 A5:2 C6:4 E6:4 D6:4", "C6:12 .:4"]
        }
    });

    // The second verse of each, on another voice.
    [["GOT", "dream"], ["LOT", "flute"], ["BOS", "vibes"], ["DIS", "lush"], ["CAL", "marimba"],
        ["JAZ", "warm"], ["ARA", "flute"], ["FOL", "warm"], ["CLU", "lush"],
        ["CIT", "vibes"], ["OFF", "vibes"], ["DYN", "flute"], ["LOV", "lush"]].forEach(([k, v]) => {
        LEVEL_SECTIONS[k + "_A2"] = Object.assign({}, LEVEL_SECTIONS[k + "_A"], { voice: v });
    });
    Object.assign(SECTIONS, LEVEL_SECTIONS);

    /* THE LEADS, SPREAD ROUND (25 Oct 2026). Nearly every tune had the same
       warm FM lead somewhere, and nearly every tune sat in the fifth and
       sixth octaves — "always that same sound, and always high pitched". So
       each section names its own instrument, and the ones that belong lower
       (`oct` -1: the sax, the guitar, the cello, the horns, the oud) play the
       tune an octave down. The main theme keeps its approved hook. */
    const LEADS = {
        A2: ["rhodes"], C: ["horn"],
        // Trimmed (the third number): gothic's and calypso's mixes lift the
        // lead for their quieter old voices; measured, kept within 1.5dB.
        GOT_A2: ["cello", -1, 0.6], GOT_B: ["horn", -1, 0.6],
        LOT_A2: ["nylon", -1],
        BOS_A: ["nylon", -1], BOS_A2: ["sax", -1], BOS_B: ["rhodes"],
        DIS_A: ["brass", -1], DIS_A2: ["rhodes"],
        CAL_A2: ["brass", -1, 0.5],
        JAZ_A2: ["sax", -1], JAZ_B: ["clarinet", -1],
        ARA_A: ["pluck", -1], ARA_A2: ["erhu"],
        FOL_A2: ["nylon", -1], FOL_B: ["erhu"],
        CLU_A2: ["brass", -1],
        CIT_A: ["rhodes"], CIT_A2: ["sax", -1],
        OFF_A2: ["rhodes"], OFF_B: ["sax", -1],
        DYN_A2: ["erhu"],
        LOV_A: ["sax", -1], LOV_A2: ["rhodes"]
    };
    for (const [name, [voice, oct, leadVol]] of Object.entries(LEADS)) {
        SECTIONS[name] = Object.assign({}, SECTIONS[name], { voice, oct: oct || 0, leadVol: leadVol || 1 });
    }

    /* Every bar of the song, worked out once: what each lane does in it and
       which chord comes next (for the bass's walk-ins). */
    function barsOf(names) {
        const out = [];
        names.forEach(name => {
            const sec = SECTIONS[name];
            sec.chords.forEach((chord, b) => {
                const last = b === sec.chords.length - 1;
                // The last bar of a section is its fill: the section's own, or
                // none at all (`fill: false`), or the theme's toms.
                const drums = !sec.drums ? "none"
                    : Array.isArray(sec.drums) ? sec.drums[b]
                    : !last ? sec.drums
                    : sec.roll ? "rollFill"
                    : sec.fill === false ? sec.drums : (sec.fill || "fill");
                out.push({
                    name, b, chord,
                    bass: BASS[typeof sec.bass === "string" ? sec.bass : sec.bass[b]],
                    drums: DRUMS[drums],
                    comp: sec.comp ? COMP[sec.comp] : [null, null],
                    compVol: sec.compVol || 1,
                    lead: sec.lead ? bar(sec.lead[b], sec.major) : null,
                    answer: sec.answers && sec.answers[b] ? bar(sec.answers[b]) : null,
                    voice: sec.voice,
                    oct: sec.oct || 0,
                    leadVol: sec.leadVol || 1,
                    crash: Boolean(sec.crash && b % (sec.crashEvery || 99) === 0),
                    fall: Boolean(sec.fall && last),
                    bubbles: Boolean(sec.bubbles && b % 2 === 1)
                });
            });
        });
        out.forEach((b, i) => { b.next = (out[i + 1] || out[0]).chord; });
        return out;
    }
    /* ---- THE TRACKS: the theme and its three other versions, each with its
       own tempo, shuffle and reverb (`wash`, how much of the band goes
       through it). An intro plays once; the loop goes round. */
    /* `mix` scales the four lanes for a track — measured, as the theme's own
       levels were (see book): each lane alone, its loudness read, the tune
       put level with the bass. */
    function track(introNames, loopNames, bpm, swing, wash, mix) {
        const intro = introNames ? barsOf(introNames) : [];
        const loop = barsOf(loopNames);
        // The intro's last bar walks into the loop's first chord.
        if (intro.length) intro[intro.length - 1].next = loop[0].chord;
        return { intro, loop, six: 15 / bpm, swing, wash, mix: Object.assign({ bass: 1, drums: 1, lead: 1, chords: 1 }, mix) };
    }
    const block = (k) => [k + "_A", k + "_B", k + "_A2", k + "_B"];
    const TRACKS = {
        theme: track(["intro"], LOOP, BPM, SWING, 0),
        ambient: track(null, ["AMB_A", "AMB_C"], 68, 0, 0.55),
        sad: track(null, ["SAD_B", "SAD_C"], 72, 0, 0.4),
        win: track(["WIN_IN"], ["WIN_B"], 120, 0.12, 0.1),
        /* The mixes from a measurement of each, 25 Oct 2026: every lane alone,
           24 seconds, its loudness read and brought to the theme's — the tune
           level with the bass at about -18, the drums -22, the chords -26. */
        gothic: track(null, block("GOT"), 96, 0, 0.3, { lead: 1.9, chords: 1.9, drums: 1.2 }),
        lotus: track(null, block("LOT"), 88, 0, 0.35, { lead: 2.5, bass: 0.95 }),
        bossa: track(null, block("BOS"), 132, 0, 0.12, { lead: 1.5, chords: 2 }),
        disco: track(null, block("DIS"), 118, 0, 0.08, { lead: 1.4, bass: 1.4, chords: 1.4 }),
        calypso: track(null, block("CAL"), 112, 0.1, 0.08, { lead: 2.8, chords: 2.5 }),
        swing: track(null, block("JAZ"), 76, 0.3, 0.15, { lead: 1.9, chords: 2.5, drums: 1.4 }),
        arabian: track(null, block("ARA"), 100, 0, 0.25, { lead: 1.9, chords: 1.5, drums: 1.3 }),
        folk: track(null, block("FOL"), 92, 0.18, 0.2, { bass: 1.15, chords: 2, drums: 1.2 }),
        club: track(null, block("CLU"), 124, 0, 0.08, { lead: 1.4, bass: 1.35 }),
        epic: track(["EPIC_IN"], ["EPIC_B", "EPIC_C", "EPIC_B"], 96, 0, 0.3, { chords: 0.6, lead: 1.2, drums: 1.4 }),
        /* The builder's four (see CIT_A onwards), given to no level. Mixed
           the same way, 25 Oct: the tune and bass at about -18, the drums
           -22 (softer for the temple and the ballad), the chords -27. */
        city: track(null, block("CIT"), 88, 0.15, 0.12, { lead: 1.5, bass: 1.35, drums: 1.2, chords: 3 }),
        office: track(null, block("OFF"), 104, 0.05, 0.1, { lead: 1.7, drums: 0.9, chords: 1.9 }),
        dynasty: track(null, block("DYN"), 80, 0, 0.35, { lead: 1.7, bass: 0.85, drums: 1.1, chords: 2.2 }),
        love: track(null, block("LOV"), 68, 0, 0.4, { lead: 1.4, bass: 1.1, drums: 1.25, chords: 1.35 })
    };
    /* WHAT THE EDITOR CALLS THEM, in the order it lists them: the run's ten
       and the finale, then the four nobody gets unless a level asks. */
    const TRACK_NAMES = [
        ["theme", "Main theme"], ["gothic", "Gothic music box"], ["lotus", "Night garden"],
        ["bossa", "Bossa nova"], ["disco", "Retro disco"], ["calypso", "Calypso"],
        ["swing", "Jazz bar"], ["arabian", "Arabian nights"], ["folk", "Autumn folk"],
        ["club", "Club floor"], ["epic", "Epic theme (finale)"],
        ["city", "Urban city"], ["office", "Business meeting"], ["dynasty", "Ancient China"],
        ["love", "Love song"], ["ambient", "Dreamy ambient"]
    ];
    /* WHICH TUNE A LEVEL PLAYS (the owner's: a new one every five levels, the
       last level the theme made epic). `n` is the level's number, from 1. */
    const BLOCKS = ["theme", "gothic", "lotus", "bossa", "disco", "calypso", "swing", "arabian", "folk", "club"];
    function trackForLevel(n, total) {
        const i = Math.max(1, Math.round(Number(n) || 1));
        if (total && i >= total) return "epic";
        return BLOCKS[Math.min(BLOCKS.length - 1, Math.floor((i - 1) / 5))];
    }
    let trk = TRACKS.theme;
    const barAt = (i) => (i < trk.intro.length ? trk.intro[i] : trk.loop[(i - trk.intro.length) % trk.loop.length]);

    // ---- the sound graph
    let A = null;                      // see build
    let musicOn = true, soundOn = true, muffled = false, volume = DEFAULT_VOLUME;
    const clampVolume = (v) => Math.max(0, Math.min(100, Math.round(Number(v))));
    try {
        musicOn = localStorage.getItem(STORE_MUSIC) !== "off";
        soundOn = localStorage.getItem(STORE_SOUND) !== "off";
        const v = localStorage.getItem(STORE_VOLUME);
        if (v !== null && v !== "" && !isNaN(Number(v))) volume = clampVolume(v);
    } catch (e) { /* private mode: on, at the default volume */ }
    const masterLevel = () => Math.pow(volume / 100, 2);
    const musicLevel = () => (musicOn ? MUSIC_VOL * (muffled ? MUFFLED_VOL : 1) : 0);

    /* ---- THE DAC'S SAMPLES, made once per context: `fn(t)` for each sample
       of a buffer at 11,025Hz, rounded to 8 bits, the way the console's own
       drums were stored. Played back they are resampled up, and keep their
       crunch. */
    const DAC_RATE = 11025;
    function dacSample(ctx, len, fn) {
        const n = Math.round(DAC_RATE * len);
        const b = ctx.createBuffer(1, n, DAC_RATE);
        const d = b.getChannelData(0);
        for (let i = 0; i < n; i++) {
            const v = Math.max(-1, Math.min(1, fn(i / DAC_RATE)));
            d[i] = Math.round(v * 127) / 127;
        }
        return b;
    }
    function makeSamples(ctx) {
        let ph = 0;
        const kick = dacSample(ctx, 0.32, (t) => {
            const f = 48 + 120 * Math.exp(-t / 0.028);
            ph += 2 * Math.PI * f / DAC_RATE;
            return Math.sin(ph) * Math.exp(-t / 0.16) + (Math.random() * 2 - 1) * Math.exp(-t / 0.003) * 0.5;
        });
        let ph2 = 0;
        const snare = dacSample(ctx, 0.26, (t) => {
            ph2 += 2 * Math.PI * (180 + 40 * Math.exp(-t / 0.02)) / DAC_RATE;
            return (Math.random() * 2 - 1) * Math.exp(-t / 0.085) * 0.75 + Math.sin(ph2) * Math.exp(-t / 0.045) * 0.6;
        });
        /* A timpani on A2, struck: the drum's partials (a timpani is close to
           harmonic, the pitch sitting on the second mode), a little high for
           the first instant as the head settles, and a soft thud of the mallet.
           Played at another pitch by playbackRate. */
        const P = [1, 1.5, 1.99, 2.44, 2.98];
        const W = [1, 0.5, 0.28, 0.14, 0.06];
        const phs = P.map(() => 0);
        const timp = dacSample(ctx, 1.1, (t) => {
            const bend = 1 + 0.025 * Math.exp(-t / 0.03);
            let v = 0;
            for (let k = 0; k < P.length; k++) {
                phs[k] += 2 * Math.PI * 110 * P[k] * bend / DAC_RATE;
                v += Math.sin(phs[k]) * W[k] * Math.exp(-t / (0.55 / (1 + k * 0.6)));
            }
            const a = Math.min(1, t / 0.002);
            return a * v * 0.55 + (Math.random() * 2 - 1) * Math.exp(-t / 0.006) * 0.35;
        });
        return { kick, snare, timp };
    }

    /* THE PSG'S NOISE: a 16-bit shift register stepped at the chip's fastest
       noise clock, held between steps — white noise with the console's own
       coarseness. One second, looped from a random point. */
    function makePsgNoise(ctx) {
        const sr = ctx.sampleRate, b = ctx.createBuffer(1, sr, sr), d = b.getChannelData(0);
        let lfsr = 0x8000, out = 1, acc = 0;
        const step = 13983 / sr;
        for (let i = 0; i < d.length; i++) {
            acc += step;
            while (acc >= 1) {
                acc -= 1;
                const bit = (lfsr ^ (lfsr >> 3)) & 1;
                lfsr = (lfsr >> 1) | (bit << 15);
                out = (lfsr & 1) ? 1 : -1;
            }
            d[i] = out;
        }
        return b;
    }

    /* One context's worth of buses:

           lanes (bass, drums, lead, chords) -> music -> 10-bit -> warm ->
               muffle -> musicVol -+
           echo (fed by the lead, returning into music)                     |
           stings -> stingVol ----------------------------------------------+-> glue -> out
           effects -> soundVol ---------------------------------------------+

       Built on whatever context it is handed, so the preview can render the
       same graph offline (see _render). */
    function build(ctx) {
        const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
        const glue = ctx.createDynamicsCompressor();
        glue.threshold.value = -12;
        glue.knee.value = 8;
        glue.ratio.value = 3;
        glue.attack.value = 0.004;
        glue.release.value = 0.16;
        // The volume slider, the last thing before the speakers (see STORE_VOLUME).
        const master = g(masterLevel());
        glue.connect(master);
        master.connect(ctx.destination);

        const musicVol = g(musicLevel());
        musicVol.connect(glue);
        const muffle = ctx.createBiquadFilter();
        muffle.type = "lowpass";
        muffle.Q.value = 0.7;
        muffle.frequency.value = muffled ? MUFFLED_HZ : OPEN_HZ;
        muffle.connect(musicVol);
        const warm = ctx.createBiquadFilter();
        warm.type = "lowpass";
        warm.Q.value = 0.5;
        warm.frequency.value = WARM_HZ;
        warm.connect(muffle);
        /* No ten-bit grain any more (25 Oct 2026): rounding the whole bus
           roughened every long note's tail, the lead's worst of all. */
        const music = g(1);
        music.connect(warm);

        /* THE WASH: a long reverb for the slow versions, the room the
           dreamy lobby and the lament sit in. Its impulse is made here —
           three seconds of noise dying away, the top darkening as it goes —
           and how much of the band goes into it is the track's (see TRACKS);
           none at all for the theme, which was approved dry. */
        const verb = ctx.createConvolver();
        const irLen = Math.round(ctx.sampleRate * 3.2);
        const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = ir.getChannelData(c);
            let lp = 0;
            for (let i = 0; i < irLen; i++) {
                const t = i / ctx.sampleRate;
                const k = Math.min(0.9, 0.25 + t * 0.25);   // darker as it dies
                lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
                d[i] = lp * Math.exp(-t / 0.85) * (t < 0.012 ? t / 0.012 : 1) * 2.2;
            }
        }
        verb.buffer = ir;
        const wash = g(trk.wash);
        music.connect(wash); wash.connect(verb); verb.connect(warm);

        const lanes = {};
        ["bass", "drums", "lead", "chords"].forEach(k => { lanes[k] = g(1); lanes[k].connect(music); });

        // A dotted-eighth echo, darkening as it repeats.
        const echo = g(1);
        const delay = ctx.createDelay(1);
        delay.delayTime.value = SIX * 3;
        const fb = g(0.3);
        const dark = ctx.createBiquadFilter();
        dark.type = "lowpass";
        dark.frequency.value = 2400;
        const ret = g(0.45);
        echo.connect(delay); delay.connect(dark); dark.connect(fb); fb.connect(delay);
        dark.connect(ret); ret.connect(music);

        const stingVol = g(musicOn ? MUSIC_VOL : 0);
        stingVol.connect(glue);
        const soundVol = g(soundOn ? SOUND_VOL : 0);
        soundVol.connect(glue);

        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

        return {
            ctx, lanes, music, muffle, musicVol, echo, wash, sting: stingVol, sound: soundVol, master, noise: buf,
            psgNoise: makePsgNoise(ctx), dac: makeSamples(ctx)
        };
    }

    function setup() {
        if (A) return true;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        /* HEARD ON AN IPHONE (28 Oct 2026, the owner's: no sound on his
           phone). Safari plays a page's Web Audio as "ambient" sound, which
           the ring/silent switch mutes, so with the switch on silent the
           game made no sound at all. A game is "playback", as a video is:
           it plays whatever the switch says, at the phone's volume. Safari
           16.4 and later; nothing elsewhere. Said in the frame's parent too,
           where the homepage window is, since the session is the tab's. */
        [window, window.parent].forEach(w => {
            try { if (w.navigator.audioSession) w.navigator.audioSession.type = "playback"; } catch (e) { /* not ours, or not Safari */ }
        });
        try { A = build(new AC()); } catch (e) { A = null; return false; }
        // Made while behind another game: a context can start out running.
        if (held) A.ctx.suspend();
        return true;
    }

    /* ---- ONE FM NOTE. p:
         vol          loudness
         mods         PARALLEL modulators on the carrier, each
                      { ratio, index, indexTo, indexTime }: frequency as a
                      multiple of the note's, how hard it wobbles the carrier
                      at the start (× the note's Hz), where that ends up after
                      indexTime seconds
         chain        or a CHAIN of them, nearest the carrier first, each
                      modulating the one before it (the YM2612's stacked
                      algorithms); `wave: "sawtooth"` on the last stands in
                      for the chip's operator feedback
         attack       seconds to full volume
         ring         struck: dies away over the whole note (bells, bars)
         sustain      otherwise the level it settles to (fraction of vol),
         decay        …that fast (a time constant),
         release      …and how fast it is cut off at the end (a time constant)
         from         a pitch to start at and fall onto the note in fromTime
         to           a pitch to glide to over the note
         cents        detune
         cut          a low-pass of the note's own (Hz)
         vib          vibrato depth (a fraction of the pitch), easing in after
                      a fifth of a second, as a player leans on a long note
         trem         tremolo depth (0..1): the vibraphone's motor
         pan          -1 left to 1 right
         wet          also this much into the echo
         bus          where it goes */
    function fm(at, dur, freq, p) {
        const ctx = A.ctx;
        if (p.cents) freq *= Math.pow(2, p.cents / 1200);
        const a = p.attack || 0.004;
        let end = at + dur;
        const rel = p.release || 0.02;
        if (!p.ring) end += rel * 5;

        const pitch = (osc, mult) => {
            if (p.from) {
                osc.frequency.setValueAtTime(p.from * mult, at);
                osc.frequency.exponentialRampToValueAtTime(freq * mult, at + (p.fromTime || 0.012));
            } else osc.frequency.setValueAtTime(freq * mult, at);
            if (p.to) osc.frequency.exponentialRampToValueAtTime(p.to * mult, at + dur);
        };
        const modulate = (md, target, targetMult) => {
            const m = ctx.createOscillator();
            if (md.wave) m.type = md.wave;
            const mult = targetMult * (md.ratio || 1);
            pitch(m, mult);
            const mg = ctx.createGain();
            const idx = md.index || 1;
            const idxTo = md.indexTo == null ? idx : md.indexTo;
            const hzOf = freq * targetMult;
            mg.gain.setValueAtTime(idx * hzOf, at);
            if (idxTo !== idx) mg.gain.exponentialRampToValueAtTime(Math.max(0.01, idxTo) * hzOf, at + (md.indexTime || dur));
            m.connect(mg); mg.connect(target.frequency);
            return { m, mult };
        };

        const c = ctx.createOscillator();
        pitch(c, 1);
        const stops = [c];
        if (p.chain) {
            let target = c, mult = 1;
            p.chain.forEach(md => {
                const r = modulate(md, target, mult);
                stops.push(r.m);
                target = r.m;
                mult = r.mult;
            });
        } else {
            (p.mods || [{ ratio: 1, index: 1 }]).forEach(md => stops.push(modulate(md, c, 1).m));
        }
        if (p.vib && dur > 0.25) {
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 5.4;
            const depth = ctx.createGain();
            depth.gain.setValueAtTime(0, at);
            depth.gain.setValueAtTime(0, at + 0.2);
            depth.gain.linearRampToValueAtTime(freq * p.vib, at + 0.45);
            lfo.connect(depth); depth.connect(c.frequency);
            stops.push(lfo);
        }

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(p.vol, at + a);
        if (p.ring) g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
        else {
            g.gain.setTargetAtTime(p.vol * (p.sustain == null ? 0.6 : p.sustain), at + a, p.decay || 0.08);
            g.gain.setTargetAtTime(0, at + dur, rel);
        }
        c.connect(g);
        let out = g;
        if (p.trem) {
            const tg = ctx.createGain();
            tg.gain.value = 1 - p.trem / 2;
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 4.6;
            const depth = ctx.createGain();
            depth.gain.value = p.trem / 2;
            lfo.connect(depth); depth.connect(tg.gain);
            out.connect(tg);
            out = tg;
            stops.push(lfo);
        }
        if (p.cut) {
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = p.cut;
            lp.Q.value = 0.5;
            out.connect(lp);
            out = lp;
        }
        if (p.pan) {
            const pn = ctx.createStereoPanner();
            pn.pan.value = p.pan;
            out.connect(pn);
            out = pn;
        }
        out.connect(p.bus);
        if (p.wet) {
            const w = ctx.createGain();
            w.gain.value = p.wet;
            out.connect(w); w.connect(A.echo);
        }
        stops.forEach(o => { o.start(at); o.stop(end + 0.03); });
    }

    /* THE PSG'S VOLUME, the way Sonic's driver moves it: a step of 2dB every
       `rate` frames from `vol` down to `floor` (a fraction of vol), held
       there, and four quick steps to nothing at the end. A curve would be
       smoother and would not sound like a Mega Drive. */
    function psgEnvelope(param, at, dur, vol, rate, floor) {
        const min = vol * (floor == null ? 0.35 : floor);
        let level = vol, t = at;
        param.setValueAtTime(level, t);
        const stepEvery = FRAME * (rate || 2);
        while (t + stepEvery < at + dur && level > min) {
            t += stepEvery;
            level = Math.max(min, level * 0.794);
            param.setValueAtTime(level, t);
        }
        let r = level, tt = at + dur;
        for (let k = 0; k < 4; k++) { r *= 0.5; param.setValueAtTime(r, tt); tt += FRAME; }
        param.setValueAtTime(0, tt);
        return tt;
    }

    // Noise through a filter: snaps, breath.
    function hiss(at, dur, vol, type, f, q, bus, pan, buffer) {
        const ctx = A.ctx;
        const s = ctx.createBufferSource();
        s.buffer = buffer || A.noise;
        const flt = ctx.createBiquadFilter();
        flt.type = type;
        flt.frequency.value = f;
        if (q) flt.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
        s.connect(flt); flt.connect(g);
        let out = g;
        if (pan) {
            const pn = ctx.createStereoPanner();
            pn.pan.value = pan;
            g.connect(pn);
            out = pn;
        }
        out.connect(bus);
        s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.03);
    }

    // A sine that drops in pitch: thuds, the sub under the bass.
    function drop(at, from, to, fall, dur, vol, bus) {
        const ctx = A.ctx;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(from, at);
        o.frequency.exponentialRampToValueAtTime(to, at + fall);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
        o.connect(g); g.connect(bus);
        o.start(at); o.stop(at + dur + 0.03);
    }

    // One of the DAC's samples, at a playback rate (a timpani's pitch).
    function dac(at, buf, vol, bus, rate, pan) {
        const ctx = A.ctx;
        const s = ctx.createBufferSource();
        s.buffer = buf;
        if (rate) s.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = vol;
        s.connect(g);
        let out = g;
        if (pan) {
            const pn = ctx.createStereoPanner();
            pn.pan.value = pan;
            g.connect(pn);
            out = pn;
        }
        out.connect(bus);
        s.start(at);
    }

    // ---- the band. `bus` defaults to the voice's lane.
    const V = {
        thumb(at, dur, f, vol, bus) {
            bus = bus || A.lanes.bass;
            fm(at, dur, f, {
                vol, bus, from: f * 1.015, fromTime: 0.01, attack: 0.002, sustain: 0.55, decay: 0.16, release: 0.015, cut: 2200,
                chain: [{ ratio: 1, index: 3.4, indexTo: 0.6, indexTime: 0.13 }, { ratio: 1, wave: "sawtooth", index: 0.5, indexTo: 0.05, indexTime: 0.07 }]
            });
            drop(at, f, f, 0.01, Math.min(dur + 0.12, 0.6), vol * 0.55, bus);
        },
        pop(at, dur, f, vol, bus) {
            bus = bus || A.lanes.bass;
            fm(at, dur, f, {
                vol, bus, from: f * 1.04, fromTime: 0.008, attack: 0.001, sustain: 0.45, decay: 0.1, release: 0.012, cut: 4500,
                chain: [{ ratio: 1, index: 5.5, indexTo: 0.9, indexTime: 0.09 }, { ratio: 3, index: 1.2, indexTo: 0.05, indexTime: 0.04 }]
            });
        },
        /* ---- THE LEVEL-BLOCK TUNES' VOICES (25 Oct 2026). All of them built
           the way the approved ones are: sine carriers, one gentle modulator,
           every one rounded off below 3.5kHz. No raw square, no saw, no
           chained operators — the owner's ears, the same day. */
        // A fingered bass note: round, a soft pluck at the front.
        finger(at, dur, f, vol, bus) {
            bus = bus || A.lanes.bass;
            fm(at, dur, f, {
                vol, bus, attack: 0.006, sustain: 0.6, decay: 0.3, release: 0.06, cut: 900,
                mods: [{ ratio: 1, index: 1.2, indexTo: 0.3, indexTime: 0.15 }]
            });
        },
        // A rim click: a short wooden tock.
        rim(at, vol, bus) {
            fm(at, 0.05, 1100, { vol, bus: bus || A.lanes.drums, ring: true, attack: 0.001, pan: 0.2,
                mods: [{ ratio: 1.48, index: 1.8, indexTo: 0.1, indexTime: 0.03 }] });
        },
        // A plucked string — koto, oud, a picked guitar: a bright edge that dies fast.
        pluck(at, dur, f, vol, bus, pan) {
            fm(at, Math.max(dur, 0.45), f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.003, cut: 3000, wet: 0.25, pan: pan || 0,
                mods: [{ ratio: 1, index: 1.6, indexTo: 0.2, indexTime: 0.25 }, { ratio: 3, index: 0.3, indexTo: 0.01, indexTime: 0.05 }]
            });
        },
        // A soft flute: slow to speak, breathy only in its vibrato.
        flute(at, dur, f, vol, bus) {
            fm(at, dur, f, {
                vol, bus: bus || A.lanes.lead, attack: 0.06, sustain: 0.85, decay: 0.3, release: 0.08, cut: 2600, vib: 0.006, wet: 0.3,
                mods: [{ ratio: 1, index: 0.45, indexTo: 0.3, indexTime: 0.3 }]
            });
        },
        // A steel drum: struck, a touch sharp as it lands.
        steel(at, dur, f, vol, bus) {
            fm(at, Math.max(dur, 0.5), f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.003, from: f * 1.02, fromTime: 0.02, cut: 3200, wet: 0.2,
                mods: [{ ratio: 1, index: 1.2, indexTo: 0.3, indexTime: 0.3 }, { ratio: 2, index: 0.8, indexTo: 0.1, indexTime: 0.2 }]
            });
        },
        // A marimba: a woody knock and a short ring.
        marimba(at, dur, f, vol, bus) {
            fm(at, Math.min(Math.max(dur, 0.3), 0.6), f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.002, cut: 3500, wet: 0.2,
                mods: [{ ratio: 4, index: 0.9, indexTo: 0.02, indexTime: 0.08 }]
            });
        },
        // An organ: the note, its octave and its twelfth, drawbars half out.
        organ(at, dur, f, vol, bus, pan) {
            [[1, 1], [2, 0.45], [3, 0.2]].forEach(([h, w]) => fm(at, dur, f * h, {
                vol: vol * w, bus: bus || A.lanes.chords, attack: 0.02, sustain: 1, decay: 0.3, release: 0.1, cut: 2400, pan: pan || 0,
                mods: [{ ratio: 1, index: 0.02 }]
            }));
        },
        // The slow versions' bass: a soft round root, held, no slap at all.
        soft(at, dur, f, vol, bus) {
            fm(at, dur, f, {
                vol, bus: bus || A.lanes.bass, attack: 0.05, sustain: 0.8, decay: 0.6, release: 0.3, cut: 520,
                mods: [{ ratio: 1, index: 0.7, indexTo: 0.2, indexTime: 0.6 }]
            });
        },
        ghost(at, f, vol, bus) {
            bus = bus || A.lanes.bass;
            fm(at, 0.04, f, {
                vol, bus, attack: 0.001, sustain: 0.3, decay: 0.015, release: 0.008, cut: 1600,
                mods: [{ ratio: 1.41, index: 6, indexTo: 1, indexTime: 0.03 }]
            });
        },

        kick(at, vol, bus) { dac(at, A.dac.kick, vol, bus || A.lanes.drums); },
        snare(at, vol, bus) { dac(at, A.dac.snare, vol, bus || A.lanes.drums); },
        timpani(at, f, vol, bus) { dac(at, A.dac.timp, vol, bus || A.lanes.drums, f / 110, -0.15); },
        // Eight timpani strokes in a crescendo, falling D3 to D2 down the run.
        roll(at, vol, bus) {
            for (let k = 0; k < 16; k++) {
                const f = TIMPS[Math.min(3, Math.floor(k / 4))];
                V.timpani(at + k * SIX / 2, f, vol * (0.35 + 0.65 * k / 15), bus);
            }
        },
        // PSG noise: a hat (closed or open), or the crash on the one.
        noise(at, dur, vol, rate, bus, pan) {
            const ctx = A.ctx;
            const s = ctx.createBufferSource();
            s.buffer = A.psgNoise;
            s.loop = true;
            // A band, not everything above 2.5kHz: the hiss without the sizzle.
            const hp = ctx.createBiquadFilter();
            hp.type = "bandpass";
            hp.frequency.value = 5000;
            hp.Q.value = 0.7;
            const g = ctx.createGain();
            const end = psgEnvelope(g.gain, at, dur, vol, rate, 0);
            s.connect(hp); hp.connect(g);
            let out = g;
            if (pan) {
                const pn = ctx.createStereoPanner();
                pn.pan.value = pan;
                g.connect(pn);
                out = pn;
            }
            out.connect(bus || A.lanes.drums);
            s.start(at, Math.random() * 0.9); s.stop(end + 0.02);
        },
        hat(at, vol, open, bus) { V.noise(at, open ? 0.16 : 0.035, vol, open ? 2 : 1, bus, 0.25); },
        crash(at, vol, bus) { V.noise(at, 1.2, vol, 4, bus, -0.2); },

        /* A PSG square: the stepped volume, and from `vib` on, the driver's
           vibrato easing in after a fifth of a second. */
        psg(at, dur, f, vol, bus, opts) {
            const ctx = A.ctx, o = opts || {};
            const osc = ctx.createOscillator();
            osc.type = "square";
            if (o.from) {
                osc.frequency.setValueAtTime(o.from, at);
                osc.frequency.exponentialRampToValueAtTime(f, at + (o.fromTime || 0.05));
            } else osc.frequency.setValueAtTime(f, at);
            const g = ctx.createGain();
            const end = psgEnvelope(g.gain, at, dur, vol, o.rate, o.floor);
            const stops = [osc];
            if (o.vib && dur > 0.25) {
                const lfo = ctx.createOscillator();
                lfo.type = "triangle";
                lfo.frequency.value = 5.6;
                const depth = ctx.createGain();
                depth.gain.setValueAtTime(0, at);
                depth.gain.setValueAtTime(f * o.vib, at + 0.2);
                lfo.connect(depth); depth.connect(osc.frequency);
                stops.push(lfo);
            }
            /* ROUNDED OFF AT 1.8kHz (25 Oct 2026, the owner's: "my ears
               hurt"). A raw square is all odd harmonics at full strength to
               the top of hearing; that is the PSG's character on a television
               speaker and a needle through headphones. Kept: the stepped
               volume, the shape of the note. Lost: the edge. */
            const soft = ctx.createBiquadFilter();
            soft.type = "lowpass";
            soft.frequency.value = 1800;
            soft.Q.value = 0.5;
            osc.connect(soft); soft.connect(g);
            let out = g;
            if (o.pan) {
                const pn = ctx.createStereoPanner();
                pn.pan.value = o.pan;
                g.connect(pn);
                out = pn;
            }
            out.connect(bus || A.lanes.lead);
            if (o.wet) {
                const w = ctx.createGain();
                w.gain.value = o.wet;
                out.connect(w); w.connect(A.echo);
            }
            stops.forEach(x => { x.start(at); x.stop(end + 0.03); });
        },
        // A bubble: a PSG square swept up, quick and quiet.
        bubble(at, vol, bus) {
            const f = 420 * (1 + ((at * 7919) % 1) * 0.4);
            V.psg(at, 0.07, f * 2.6, vol, bus || A.lanes.chords, { from: f, fromTime: 0.06, rate: 1, floor: 0.2, pan: 0.3 });
        },

        // The vibraphone: FM bars, a long ring, the motor's tremolo.
        vibes(at, dur, f, vol, bus, pan) {
            fm(at, Math.max(dur, 1.1), f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.003, trem: 0.4, pan: pan || 0, wet: 0.3,
                mods: [{ ratio: 4, index: 1.1, indexTo: 0.05, indexTime: 0.35 }, { ratio: 1, index: 0.3, indexTo: 0.05, indexTime: 0.2 }]
            });
        },
        /* The hook's lead: a warm, round FM voice — the modulator at the
           note's own pitch, barely leaned on, a whisper of the octave over
           it, rounded off at 2.4kHz — doubled a few cents apart for body.

           NOT a chain with a saw on top (25 Oct 2026). That was the first
           try at a Sonic synth-brass, with a PSG square an octave over it,
           and the owner's verdict on it was unprintable: buzzing and shrill
           on exactly the part that is meant to be the catchy one. */
        lead(at, dur, f, vol, bus, wet) {
            const p = {
                vol, bus: bus || A.lanes.lead, attack: 0.025, sustain: 0.8, decay: 0.3, release: 0.07, cut: 2400, vib: 0.005,
                wet: wet == null ? 0.25 : wet,
                mods: [{ ratio: 1, index: 0.9, indexTo: 0.6, indexTime: 0.2 }, { ratio: 2, index: 0.15 }]
            };
            fm(at, dur, f, Object.assign({}, p, { cents: -5, pan: -0.15 }));
            fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.8, cents: 5, pan: 0.15, wet: 0 }));
        },
        /* ---- MORE LEADS (25 Oct 2026, the owner's: "the lead is always that
           same sound, and always high pitched … surely we can have some
           variations"). Each a different instrument, every one of them sine
           FM rounded off well under 3kHz — no squares, saws or crushing on a
           held note, after the hook that hurt. */
        // Synth brass: the index swells as the note speaks, a horn's blat,
        // then settles; two voices a few cents apart for a section.
        brass(at, dur, f, vol, bus) {
            const p = {
                vol, bus: bus || A.lanes.lead, attack: 0.035, sustain: 0.75, decay: 0.25, release: 0.08, cut: 2200, vib: 0.004, wet: 0.2,
                from: f * 0.985, fromTime: 0.05,
                mods: [{ ratio: 1, index: 0.4, indexTo: 1.5, indexTime: 0.07 }, { ratio: 2, index: 0.12 }]
            };
            fm(at, dur, f, Object.assign({}, p, { cents: -6, pan: -0.2 }));
            fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.8, cents: 6, pan: 0.2, wet: 0 }));
        },
        // A tenor sax: a scoop up into each note, reedy, a slow wide vibrato.
        sax(at, dur, f, vol, bus) {
            fm(at, dur, f, {
                vol, bus: bus || A.lanes.lead, attack: 0.03, sustain: 0.8, decay: 0.2, release: 0.09, cut: 1900, vib: 0.009, wet: 0.22,
                from: f * 0.955, fromTime: 0.07,
                mods: [{ ratio: 1, index: 1.6, indexTo: 1.05, indexTime: 0.15 }, { ratio: 3, index: 0.18 }]
            });
        },
        // An electric piano for a tune: a soft bell of a tine, a round body,
        // a slow tremolo.
        rhodes(at, dur, f, vol, bus) {
            fm(at, Math.max(dur, 0.7), f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.003, trem: 0.25, cut: 2600, wet: 0.22,
                mods: [{ ratio: 1, index: 1.1, indexTo: 0.25, indexTime: 0.6 }, { ratio: 14, index: 0.18, indexTo: 0.01, indexTime: 0.04 }]
            });
        },
        // A nylon-string guitar: plucked, warm, quick to soften.
        nylon(at, dur, f, vol, bus) {
            fm(at, Math.max(dur, 0.6), f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.002, cut: 2200, wet: 0.18, from: f * 1.006, fromTime: 0.015,
                mods: [{ ratio: 1, index: 1.9, indexTo: 0.25, indexTime: 0.18 }, { ratio: 2, index: 0.5, indexTo: 0.04, indexTime: 0.1 }]
            });
        },
        // A clarinet: the modulator an octave up gives the hollow, odd-
        // harmonic reed; slow to speak, a little vibrato.
        clarinet(at, dur, f, vol, bus) {
            fm(at, dur, f, {
                vol, bus: bus || A.lanes.lead, attack: 0.045, sustain: 0.85, decay: 0.25, release: 0.07, cut: 2300, vib: 0.004, wet: 0.25,
                mods: [{ ratio: 2, index: 1.1, indexTo: 0.8, indexTime: 0.2 }]
            });
        },
        // A bowed fiddle — the erhu for China, a fiddle for the folk: a
        // slide up into the note and a wide, singing vibrato.
        erhu(at, dur, f, vol, bus) {
            fm(at, dur, f, {
                vol, bus: bus || A.lanes.lead, attack: 0.07, sustain: 0.9, decay: 0.2, release: 0.12, cut: 2400, vib: 0.013, wet: 0.3,
                from: f * 0.93, fromTime: 0.11,
                mods: [{ ratio: 1, index: 1.3, indexTo: 1.0, indexTime: 0.3 }, { ratio: 2, index: 0.3 }]
            });
        },
        // A cello for a low tune: bowed, dark, slow to arrive.
        cello(at, dur, f, vol, bus) {
            const p = {
                vol, bus: bus || A.lanes.lead, attack: 0.09, sustain: 0.95, decay: 0.3, release: 0.15, cut: 1500, vib: 0.007, wet: 0.3,
                mods: [{ ratio: 1, index: 1.4, indexTo: 1.1, indexTime: 0.3 }, { ratio: 2, index: 0.2 }]
            };
            fm(at, dur, f, Object.assign({}, p, { cents: -4, pan: -0.1 }));
            fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.7, cents: 4, pan: 0.1, wet: 0 }));
        },
        // A French horn: round and mellow, the note barely leaned on.
        horn(at, dur, f, vol, bus) {
            fm(at, dur, f, {
                vol, bus: bus || A.lanes.lead, attack: 0.07, sustain: 0.85, decay: 0.3, release: 0.12, cut: 1300, vib: 0.003, wet: 0.35,
                mods: [{ ratio: 1, index: 0.8, indexTo: 0.6, indexTime: 0.2 }]
            });
        },
        // The electric piano's stab, chained: a tine on top, quick to go.
        epStab(at, f, vol, pan) {
            fm(at, 0.35, f, {
                vol, bus: A.lanes.chords, ring: true, attack: 0.002, pan: pan || -0.3,
                chain: [{ ratio: 1, index: 1.5, indexTo: 0.2, indexTime: 0.3 }, { ratio: 7, index: 0.5, indexTo: 0.02, indexTime: 0.05 }]
            });
        },
        // Strings: two detuned FM voices, slow to arrive, rounded off.
        strings(at, dur, f, vol, bus) {
            const p = {
                vol, bus: bus || A.lanes.chords, attack: 0.35, sustain: 1, decay: 0.6, release: 0.35, cut: 1800, vib: 0.004,
                mods: [{ ratio: 1, index: 0.9 }]
            };
            fm(at, dur, f, Object.assign({}, p, { cents: -7, pan: -0.4 }));
            fm(at, dur, f, Object.assign({}, p, { cents: 7, pan: 0.4 }));
        },
        bell(at, f, vol, bus, dur) {
            fm(at, dur || 0.8, f, {
                vol, bus: bus || A.lanes.lead, ring: true, attack: 0.002, wet: 0.4, pan: -0.15,
                mods: [{ ratio: 3.5, index: 2.2, indexTo: 0.08, indexTime: 0.6 }]
            });
        },
        // A slide whistle: something falling past (the effects' "fall").
        whistle(at, dur, from, to, vol, bus) {
            const ctx = A.ctx;
            const o = ctx.createOscillator();
            o.type = "sine";
            o.frequency.setValueAtTime(from, at);
            o.frequency.exponentialRampToValueAtTime(to, at + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(vol, at + 0.05);
            g.gain.setValueAtTime(vol, at + dur * 0.8);
            g.gain.linearRampToValueAtTime(0, at + dur);
            o.connect(g); g.connect(bus || A.lanes.lead);
            o.start(at); o.stop(at + dur + 0.03);
        }
    };

    // ---- one sixteenth of the song
    /* ONE NOTE OF THE TUNE on a voice, at the volume each is set to — the
       player calls it, and so does the dev-only _voice (which renders a
       voice alone, to level a new one against the old). */
    function playLead(voice, t, d, f, g) {
        g = g || 1;               // a section's own level for its lead (LEADS)
        if (voice === "vibes") V.vibes(t, d, f, 0.45);
        else if (voice === "warm") V.lead(t, d, f, 0.24);
        else if (voice === "hook") {
            // A vibraphone an octave over the lead for the sparkle, in
            // place of the PSG square that was there.
            V.lead(t, d, f, 0.26);
            V.vibes(t, d, f * 2, 0.07);
        } else if (voice === "soft") {
            V.lead(t, d, f, 0.22);
            V.vibes(t, d, f, 0.12);
        } else if (voice === "dream") {
            // The lobby: the vibraphone, a breath of strings under it.
            V.vibes(t, d, f, 0.34);
            V.strings(t, d, f, 0.025);
        } else if (voice === "sad") {
            // The lament: the vibraphone over the warm lead, held low.
            V.vibes(t, d, f, 0.3);
            V.lead(t, d, f, 0.1);
        }
        // The level-block tunes' leads.
        else if (voice === "pluck") V.pluck(t, d, f, 0.32);
        else if (voice === "flute") V.flute(t, d, f, 0.28);
        else if (voice === "steel") V.steel(t, d, f, 0.3);
        else if (voice === "marimba") V.marimba(t, d, f, 0.4);
        else if (voice === "lush") { V.lead(t, d, f, 0.22); V.strings(t, d, f, 0.035); }
        // The more-leads set (see V.brass): each its own instrument.
        else if (voice === "brass") V.brass(t, d, f, 0.2 * g);
        else if (voice === "sax") V.sax(t, d, f, 0.26 * g);
        else if (voice === "rhodes") V.rhodes(t, d, f, 0.46 * g);
        else if (voice === "nylon") V.nylon(t, d, f, 0.49 * g);
        else if (voice === "clarinet") V.clarinet(t, d, f, 0.26 * g);
        else if (voice === "erhu") V.erhu(t, d, f, 0.22 * g);
        else if (voice === "cello") V.cello(t, d, f, 0.27 * g);
        else if (voice === "horn") V.horn(t, d, f, 0.2 * g);
        else if (voice === "epic") {
            // The last level: the lead, doubled an octave down and on the strings.
            V.lead(t, d, f, 0.24);
            V.lead(t, d, f / 2, 0.14);
            V.strings(t, d, f, 0.05);
        }
    }

    function book(at, i) {
        const b = barAt(Math.floor(i / 16));
        const s = i % 16;
        const L = trk.six;              // this track's sixteenth
        const t = at + (s % 2 ? trk.swing * L : 0);
        const ch = chordOf(b.chord), nx = chordOf(b.next);

        // Bass
        const tok = b.bass[s];
        if (tok !== "." && tok !== "-") {
            let len = 1;
            while (s + len < 16 && b.bass[s + len] === "-") len++;
            const d = len * L * 0.9;
            const r = ch.root;
            if (tok === "T") V.thumb(t, d, hz(r), 0.4);
            else if (tok === "5") V.thumb(t, d, hz(r + 7), 0.37);
            else if (tok === "a") V.thumb(t, d, hz(nx.root - 1), 0.37);
            else if (tok === "u") V.thumb(t, d, hz(nx.root + 1), 0.37);
            else if (tok === "O") V.pop(t, d, hz(r + 12), 0.33);
            else if (tok === "7") V.pop(t, d, hz(r + ch.sev), 0.31);
            else if (tok === "g") V.ghost(t, hz(r + 12), 0.17);
            else if (tok === "P") V.soft(t, len * L * 0.98, hz(r), 0.34);
            else if (tok === "F") V.finger(t, d, hz(r), 0.4);
            else if (tok === "f") V.finger(t, d, hz(r + (ch.fifth || 7)), 0.37);
            else if (tok === "3") V.finger(t, d, hz(r + (ch.third || 4)), 0.37);
            else if (tok === "w") V.finger(t, d, hz(nx.root - 1), 0.36);
        }

        // Drums
        const dr = b.drums;
        /* Levels measured, not guessed: each lane rendered alone, RMS over
           the first 30 seconds, aiming at bass -18, lead -18, drums -22,
           chords -26 — so the tune sits level with the bass it is over. */
        if (dr.kick[s] === "K") V.kick(t, 0.45);
        const sn = dr.snare[s];
        if (sn === "S") V.snare(t, 0.28);
        else if (sn === "g") V.snare(t, 0.07);
        else if (sn === "C") { V.snare(t, 0.28); V.noise(t, 0.09, 0.05, 1); }
        else if (sn === "r") V.rim(t, 0.12);
        const h = dr.hat[s];
        if (h === "H") V.hat(t, 0.06);
        else if (h === "h") V.hat(t, 0.03);
        else if (h === "o") V.hat(t, 0.045, true);
        const x = dr.extra[s];
        if (x === "T") V.timpani(t, TIMPS[s - 12] || 110, 0.32);
        else if (x === "R") V.roll(t, 0.3);
        else if (x === "B") V.bubble(t, 0.035);
        else if (x === "Q") V.timpani(t, hz(ch.root + 12), 0.26);
        if (s === 0 && b.crash) { V.crash(t, 0.05); V.timpani(t, 73, 0.3); }
        if (b.bubbles && s === 12) { V.bubble(t, 0.03); V.bubble(t + L, 0.025); }
        /* The bridge's last bar: a PSG run falling through two octaves, the
           furni coming down — the slide whistle's old job, in the console's
           own voice. */
        if (b.fall && s < 8) V.vibes(t, L * 0.9, hz(93 - s * 3), 0.07, A.lanes.chords, 0.3);

        // Chords
        b.comp.forEach(line => {
            if (!line) return;
            const c = line[s];
            if (c === "." || c === "-") return;
            let len = 1;
            while (s + len < 16 && line[s + len] === "-") len++;
            const d = len * L;
            const cv = b.compVol;
            // Which of this line's notes this is, for the arpeggios.
            const nth = line.slice(0, s).split(c).length - 1;
            if (c === "a") {
                // One note of the arpeggio: the chord's next tone, an octave up.
                const k = nth % ch.tones.length;
                V.vibes(t, L * 8, hz(ch.tones[k] + 12), 0.06 * cv, A.lanes.chords, (k - 1.5) * 0.3);
                return;
            }
            if (c === "k") {
                // One picked note: the chord's next tone, up and down again.
                const up = ch.tones.concat(ch.tones.slice(1, -1).reverse());
                const k = nth % up.length;
                V.pluck(t, L * 3, hz(up[k]), 0.07 * cv, A.lanes.chords, (k - 1.5) * 0.2);
                return;
            }
            ch.tones.forEach((n, k) => {
                if (c === "o") V.organ(t, d, hz(n), 0.035 * cv, A.lanes.chords, (k - 1.5) * 0.2);
                else if (c === "c") V.epStab(t, hz(n), 0.14 * cv);
                else if (c === "p") V.strings(t, d, hz(n), 0.05 * cv);
                else if (c === "v") V.vibes(t, d, hz(n), 0.09 * cv, A.lanes.chords, (k - 1.5) * 0.25);
            });
        });

        // The tune
        const ev = b.lead && b.lead[s];
        if (ev) {
            // `oct` takes a section's tune down (or up) whole octaves — the
            // sax, the guitar and the cello play it in the tenor's range.
            const d = ev.len * L * 0.95, f = hz(ev.note + 12 * (b.oct || 0));
            playLead(b.voice, t, d, f, b.leadVol);
        }
        const an = b.answer && b.answer[s];
        if (an) V.vibes(t, L * 0.9, hz(an.note), 0.12, A.lanes.lead, -0.3);
    }

    // ---- the clock
    let timer = 0, playing = false, nextAt = 0, step = 0;

    function tick() {
        /* Nothing booked on a stopped clock (27 Oct 2026, the live audit):
           before the first press every note started on it was refused with
           a warning in the console, about thirty in the page's first
           seconds. The clock stands still meanwhile, so the tune starts from
           its top on the press. */
        if (A.ctx.state !== "running") return;
        const now = A.ctx.currentTime;
        // Fallen behind (a stall, a throttled timer): let those steps go
        // rather than book them all into one instant.
        if (nextAt < now - 0.25) {
            const behind = Math.ceil((now - nextAt) / trk.six);
            step += behind;
            nextAt += behind * trk.six;
        }
        while (nextAt < now + 0.12) {
            book(nextAt, step++);
            nextAt += trk.six;
        }
    }

    /* A browser starts no sound until the page has been clicked or a key
       pressed. Arriving straight at /fallinfurni that may not have happened,
       so a context that is not running waits for the first press. */
    /* NEVER WHILE THE TAB IS HIDDEN (26 Oct 2026). pause() suspends the
       context when the tab goes, but a sting's or a track switch's timer
       still fired behind it (start() wakes), and the tune came back in a tab
       nobody was looking at — clear a level, switch tabs, and 2.4 seconds
       later the music played on in the background. The page's own
       visibilitychange calls resume() when the tab is back.

       AND A TAP COUNTS (26 Oct 2026). Only pointerdown and keydown were
       listened for, and a finger's pointerdown is not a gesture a browser
       lets start sound (pointerup and touchend are): on a phone the first
       tap's resume was refused and the listener gone with it. So pointerup
       and touchend are listened for too, and every one of them is kept
       until the context is actually running. */
    /* AND NEVER WHILE ANOTHER GAME IS IN FRONT (26 Oct 2026). On the
       homepage Pura Panic and Scout's Trail can be open beside this window,
       and only the front one plays: behind, the page calls hold(true) and
       the whole context stops — the lobby's drift as well as a round's
       tune, nothing muffled left underneath — and nothing here wakes it
       (a sting's timer, a track switch, a tap) until hold(false). */
    let held = false;
    let waiting = false;
    const WAKE_ON = ["pointerdown", "pointerup", "touchend", "keydown"];
    /* NOT ASKED BEFORE A PRESS (27 Oct 2026, the live audit). A resume()
       before the page has been pressed is refused, and the browser says so
       in the console every time: once for each start() and sting, 31 times
       in the page's first eight seconds. The listeners below ask on the
       first press instead. In the homepage's window the press that opened
       it counts (the frame may play sound on its parent's press). A browser
       that cannot say is asked, as before. */
    function mayStart() {
        try {
            const ua = navigator.userActivation;
            if (!ua || ua.hasBeenActive) return true;
            const up = window.parent !== window && window.parent.navigator.userActivation;
            return Boolean(up && up.hasBeenActive);
        } catch (e) { return true; }
    }
    function wake() {
        if (!A || A.ctx.state === "running" || A.ctx.state === "closed") return;
        if (document.hidden || held) return;
        if (mayStart()) A.ctx.resume().catch(() => {});
        if (waiting) return;
        waiting = true;
        const done = () => {
            waiting = false;
            WAKE_ON.forEach(ev => document.removeEventListener(ev, go, true));
        };
        const go = () => {
            if (!A || A.ctx.state === "running" || A.ctx.state === "closed") { done(); return; }
            if (held) return;
            A.ctx.resume().then(() => { if (A && A.ctx.state === "running") done(); }, () => {});
        };
        WAKE_ON.forEach(ev => document.addEventListener(ev, go, true));
    }

    /* A track from the top (its intro first), or carrying on if that track
       is already playing — a new round does not restart a tune that is
       going, it just opens the door.

           opts.track     "theme" (the default), "ambient" for the lobby,
                          "sad" for the game over, "win" for the whole game
                          finished
           opts.muffled   the theme from the next room: the screens between
                          rounds, the pause

       Asked for another track while one plays, the one playing fades out
       over half a second and the new one comes in from its top. */
    let switchTimer = 0;
    function start(opts) {
        if (!setup()) return;
        wake();
        const want = Boolean(opts && opts.muffled);
        const next = TRACKS[(opts && opts.track) || "theme"] || TRACKS.theme;
        clearTimeout(switchTimer);
        // Asked for a track outright: a sting's promise to bring one back is off.
        clearTimeout(stingTimer);
        if (playing && next === trk) { setMuffled(want); return; }
        if (playing) {
            stop(0.5);
            switchTimer = setTimeout(() => start(opts), 520);
            return;
        }
        trk = next;
        muffled = want;
        const ctx = A.ctx, t = ctx.currentTime;
        step = 0;
        A.wash.gain.setValueAtTime(trk.wash, t);
        Object.keys(A.lanes).forEach(k => A.lanes[k].gain.setValueAtTime(trk.mix[k], t));
        A.muffle.frequency.cancelScheduledValues(t);
        A.muffle.frequency.setValueAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, t);
        A.musicVol.gain.cancelScheduledValues(t);
        A.musicVol.gain.setValueAtTime(0, t);
        A.musicVol.gain.linearRampToValueAtTime(musicLevel(), t + 0.4);
        nextAt = t + 0.06;
        playing = true;
        clearInterval(timer);
        timer = setInterval(tick, 25);
    }

    // Fades out over `fade` seconds (default a fifth) and stops booking.
    function stop(fade) {
        if (!playing) return;
        playing = false;
        clearInterval(timer);
        if (!A) return;
        const t = A.ctx.currentTime;
        A.musicVol.gain.cancelScheduledValues(t);
        A.musicVol.gain.setValueAtTime(A.musicVol.gain.value, t);
        A.musicVol.gain.linearRampToValueAtTime(0, t + (fade == null ? 0.2 : fade));
    }

    // Eased over a fifth of a second: a door closing, not a switch.
    function setMuffled(on) {
        muffled = Boolean(on);
        if (!A) return;
        const t = A.ctx.currentTime;
        A.muffle.frequency.cancelScheduledValues(t);
        A.muffle.frequency.setTargetAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, t, 0.07);
        if (playing) {
            A.musicVol.gain.cancelScheduledValues(t);
            A.musicVol.gain.setTargetAtTime(musicLevel(), t, 0.07);
        }
    }

    // Pausing stops the audio clock itself, so nothing booked plays on.
    function pause() { if (A && A.ctx.state === "running") A.ctx.suspend(); }
    function resume() { if (A && A.ctx.state !== "running" && A.ctx.state !== "closed") wake(); }
    // Behind another game and back (see `held` above wake).
    function hold(on) {
        held = Boolean(on);
        if (held) pause(); else resume();
    }

    // ---- THE STINGS, each from `at` on the audio clock, on the sting bus.
    const STINGS = {
        /* Up the D minor chord and out into D MAJOR, the act cleared: the
           lead with the PSG over it, a timpani roll into the hit, the strings
           holding it. */
        clear(at) {
            const bus = A.sting;
            [69, 74, 77, 81].forEach((n, i) => V.lead(at + i * SIX, SIX * 0.9, hz(n), 0.2, bus, 0));
            for (let k = 0; k < 4; k++) V.timpani(at + k * SIX, 110, 0.15 + k * 0.04, bus);
            const hit = at + 4 * SIX;
            V.lead(hit, SIX * 10, hz(86), 0.2, bus, 0);
            [66, 69, 73, 76].forEach(n => V.strings(hit, SIX * 12, hz(n), 0.035, bus));
            V.pop(at + 3 * SIX, SIX * 0.9, hz(50), 0.35, bus);
            V.thumb(hit, SIX * 8, hz(38), 0.45, bus);
            V.kick(hit, 0.45, bus);
            V.timpani(hit, 73, 0.3, bus);
            V.crash(hit, 0.06, bus);
            [86, 90, 93, 98].forEach((n, i) => V.vibes(hit + (2 + i) * SIX, 0.3, hz(n), 0.07, bus));
            return 2.4;
        },
        /* GAME OVER: POWERING DOWN (27 Oct 2026, the owner's: "an appropriate
           powering down sound sting when losing"). The machine winds down —
           a buzzing FM tone sliding two and a half octaves from D, losing its
           edge as it goes, with a twin a few cents under it — while the PSG
           falls down the D minor chord, each note later than the last, like
           a tape slowing. It ends on a tape-stop thud and the click of the
           power going off. The sad tune follows it (showRoundEnd). */
        lost(at) {
            const bus = A.sting;
            const wind = 1.5;
            [0, -14].forEach((cents, i) => fm(at, wind, hz(74), {
                to: hz(38), cents, vol: i ? 0.09 : 0.14, bus, attack: 0.01, sustain: 1, decay: 0.3, release: 0.08,
                cut: 2600, mods: [{ ratio: 1, index: 2.2, indexTo: 0.25, indexTime: wind }]
            }));
            let t = at + 0.05;
            [86, 81, 77, 74, 69, 65, 62].forEach((n, i) => {
                const len = 0.09 + i * 0.035;
                V.psg(t, len * 0.9, hz(n), 0.035 - i * 0.003, bus, { rate: 1, floor: 0.35 });
                t += len;
            });
            const stop = at + wind - 0.05;
            drop(stop, 95, 28, 0.45, 0.7, 0.4, bus);
            V.thumb(stop, 0.5, hz(26), 0.4, bus);
            V.timpani(stop + 0.02, 55, 0.28, bus);
            hiss(stop + 0.55, 0.05, 0.08, "lowpass", 1800, 0, bus);
            return wind + 0.8;
        },
        // A life back: the PSG's quick run up the D major chord, vibes on top.
        won(at) {
            const bus = A.sting;
            [74, 78, 81, 86, 90, 93].forEach((n, i) => {
                V.psg(at + i * 0.07, 0.08, hz(n), 0.045, bus, { rate: 1, floor: 0.5 });
                V.lead(at + i * 0.07, 0.08, hz(n - 12), 0.1, bus, 0);
            });
            V.vibes(at + 0.42, 1.2, hz(98), 0.12, bus);
            V.psg(at + 0.42, 0.6, hz(86), 0.04, bus, { rate: 3, floor: 0.3, vib: 0.008 });
            return 1.6;
        },
        /* The run over: the hook's first phrase at half speed on the
           vibraphone, Dm - Bb - Gm - A, home to D, a last low timpani. */
        over(at) {
            const bus = A.sting;
            const sl = SIX * 2;
            const tune = [[74, 0, 2], [77, 2, 2], [81, 4, 3], [79, 7, 1], [77, 10, 2], [76, 12, 2], [74, 14, 6]];
            tune.forEach(([n, s, l]) => {
                V.vibes(at + s * sl, l * sl + 0.4, hz(n), 0.17, bus);
                V.psg(at + s * sl, l * sl * 0.95, hz(n), 0.025, bus, { rate: 4, floor: 0.5, vib: 0.008 });
            });
            const chords = [["Dm7", 0], ["Bbmaj7", 4], ["Gm7", 8], ["A7", 12], ["Dm7", 16]];
            chords.forEach(([name, s], k) => {
                const c = CHORDS[name], last = k === chords.length - 1;
                const d = (last ? 8 : 4) * sl;
                c.tones.forEach(n => V.strings(at + s * sl, d, hz(n), 0.028, bus));
                V.thumb(at + s * sl, Math.min(d, 1.2), hz(c.root), 0.38, bus);
            });
            V.timpani(at + 16 * sl, 73, 0.32, bus);
            V.kick(at + 16 * sl, 0.3, bus);
            return 16 * sl + 2.2;
        }
    };

    let stingTimer = 0;
    /* A sting on its own: the tune fades for it. Afterwards it comes back
       (muffled, unless `then` says otherwise) if `then` is given; otherwise
       it stays off until the next start(). */
    function sting(name, then) {
        if (!setup() || !STINGS[name]) return;
        wake();
        stop(0.12);
        clearTimeout(stingTimer);
        const len = STINGS[name](A.ctx.currentTime + 0.05);
        if (then) stingTimer = setTimeout(() => start(then), len * 1000);
    }

    // ---- THE SOUND EFFECTS, on their own bus, from `at`.
    const SEAT_SCALE = [74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93];
    const SFX = {
        // A piece starting to fall: a short soft whistle down.
        fall(at) { V.whistle(at, 0.24, 1400, 700, 0.03, A.sound); },
        // Landing: a wooden thump, a little different each time.
        land(at, heavy) {
            const k = 0.92 + Math.random() * 0.16;
            drop(at, (heavy ? 110 : 150) * k, (heavy ? 45 : 60) * k, 0.07, 0.22, 0.5, A.sound);
            hiss(at, 0.06, 0.18, "lowpass", 700 * k, 0, A.sound);
            fm(at, 0.08, 330 * k, { vol: 0.08, bus: A.sound, ring: true, mods: [{ ratio: 1.6, index: 2.5, indexTo: 0.2, indexTime: 0.05 }] });
        },
        // The right seat: a vibraphone note and a PSG blip, a step further
        // up the scale for every seat in the streak.
        seat(at, streak) {
            const n = SEAT_SCALE[Math.max(0, Math.min(SEAT_SCALE.length - 1, (streak || 1) - 1))];
            V.vibes(at, 0.6, hz(n), 0.18, A.sound);
            V.psg(at, 0.09, hz(n), 0.04, A.sound, { rate: 1, floor: 0.4 });
        },
        // Out of order: a flat, buzzing "bah-bum".
        wrong(at) {
            [58, 57].forEach((n, i) => fm(at + i * 0.13, 0.12, hz(n), {
                vol: 0.2, bus: A.sound, attack: 0.004, sustain: 0.8, decay: 0.1, release: 0.02, cut: 1800,
                mods: [{ ratio: 1, index: 3.5 }, { ratio: 0.5, index: 0.8 }]
            }));
        },
        // A decoy: one low, wooden "bonk".
        decoy(at) {
            fm(at, 0.18, 196, { vol: 0.22, bus: A.sound, ring: true, mods: [{ ratio: 1.5, index: 3, indexTo: 0.2, indexTime: 0.08 }] });
        },
        // The auto-kick chair: a spring, then the landing.
        poi(at) {
            const ctx = A.ctx;
            const o = ctx.createOscillator();
            o.type = "sine";
            o.frequency.setValueAtTime(180, at);
            o.frequency.exponentialRampToValueAtTime(700, at + 0.35);
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 18;
            const depth = ctx.createGain();
            depth.gain.setValueAtTime(90, at);
            depth.gain.exponentialRampToValueAtTime(5, at + 0.35);
            lfo.connect(depth); depth.connect(o.frequency);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.25, at);
            g.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
            o.connect(g); g.connect(A.sound);
            o.start(at); o.stop(at + 0.42);
            lfo.start(at); lfo.stop(at + 0.42);
            SFX.land(at + 0.42, true);
        },
        // The last seconds: a woodblock tock, higher when it is urgent.
        tick(at, urgent) {
            fm(at, 0.07, urgent ? 1760 : 1320, { vol: 0.12, bus: A.sound, ring: true, mods: [{ ratio: 1.5, index: 3, indexTo: 0.2, indexTime: 0.03 }] });
        },
        // A life won back: the sting's quick run up the D major chord.
        life(at) { STINGS.won(at); },
        // THE COFFEE (25 Oct). Landing: two high vibes, a twinkle that says
        // "something to pick up" without sounding like a seat.
        coffeeAppear(at) {
            V.vibes(at, 0.5, hz(93), 0.08, A.sound, -0.2);
            V.vibes(at + 0.09, 0.6, hz(98), 0.07, A.sound, 0.2);
        },
        // Drinking it: a slurp — noise through a band-pass sweeping up —
        // and a quick run up the vibes.
        coffee(at) {
            const ctx = A.ctx;
            const s = ctx.createBufferSource();
            s.buffer = A.noise;
            const flt = ctx.createBiquadFilter();
            flt.type = "bandpass";
            flt.Q.value = 6;
            flt.frequency.setValueAtTime(450, at);
            flt.frequency.exponentialRampToValueAtTime(1500, at + 0.22);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0005, at);
            g.gain.exponentialRampToValueAtTime(0.32, at + 0.04);
            g.gain.exponentialRampToValueAtTime(0.0005, at + 0.26);
            s.connect(flt); flt.connect(g); g.connect(A.sound);
            s.start(at, Math.random() * 0.5); s.stop(at + 0.3);
            [81, 86, 90, 93].forEach((n, i) => V.vibes(at + 0.2 + i * 0.06, 0.45, hz(n), 0.11, A.sound));
        },
        // BRAIN FREEZE: a cold shimmer down the vibes over a breath of
        // high, hissing frost.
        freeze(at) {
            [98, 93, 90, 86, 81].forEach((n, i) => V.vibes(at + i * 0.05, 0.6, hz(n), 0.09, A.sound, (i - 2) * 0.2));
            hiss(at, 0.5, 0.05, "highpass", 5000, 0, A.sound);
        },
        // Wearing off: the same run, two notes and down.
        coffeeEnd(at) {
            V.vibes(at, 0.4, hz(86), 0.08, A.sound);
            V.vibes(at + 0.1, 0.6, hz(81), 0.07, A.sound);
        },
        // The three-two-one on the PSG, and Go a fourth up, held.
        count(at, go) {
            const f = hz(go ? 86 : 81);
            V.psg(at, go ? 0.4 : 0.12, f, 0.07, A.sound, { rate: go ? 3 : 1, floor: 0.4 });
            V.psg(at, go ? 0.4 : 0.12, f / 2, 0.04, A.sound, { rate: go ? 3 : 1, floor: 0.4 });
        }
    };

    function play(name, arg) {
        if (!soundOn || !SFX[name] || !setup()) return;
        wake();
        SFX[name](A.ctx.currentTime + 0.01, arg);
    }

    function setMusic(on) {
        musicOn = Boolean(on);
        try { localStorage.setItem(STORE_MUSIC, musicOn ? "on" : "off"); } catch (e) { /* not remembered */ }
        if (!A) return;
        const t = A.ctx.currentTime;
        A.musicVol.gain.cancelScheduledValues(t);
        A.musicVol.gain.setTargetAtTime(playing ? musicLevel() : 0, t, 0.05);
        A.sting.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, t, 0.05);
    }
    function setSound(on) {
        soundOn = Boolean(on);
        try { localStorage.setItem(STORE_SOUND, soundOn ? "on" : "off"); } catch (e) { /* not remembered */ }
        if (A) A.sound.gain.setTargetAtTime(soundOn ? SOUND_VOL : 0, A.ctx.currentTime, 0.05);
    }
    // 0-100, remembered; heard as its square (see STORE_VOLUME).
    function setVolume(v) {
        if (isNaN(Number(v))) return;
        volume = clampVolume(v);
        try { localStorage.setItem(STORE_VOLUME, String(volume)); } catch (e) { /* not remembered */ }
        if (A) A.master.gain.setTargetAtTime(masterLevel(), A.ctx.currentTime, 0.03);
    }

    window.FFAudio = {
        start, stop, setMuffled, pause, resume, hold, sting, play, setMusic, setSound, setVolume, trackForLevel,
        // The tunes a level can be given, as [id, name] — the editor's list.
        tracks: () => TRACK_NAMES.filter(([id]) => TRACKS[id]).map(([id, name]) => ({ id, name })),
        hasTrack: (id) => Boolean(id && TRACKS[id]),
        get music() { return musicOn; },
        get sound() { return soundOn; },
        get volume() { return volume; },
        get playing() { return playing; }
    };

    if (location.hostname !== "localhost") return;

    /* ---- FOR THE DEV SERVER ONLY: render offline, for previews and for
       measuring. what: a track from the top ("theme", or "song" for it;
       "ambient", "sad", "win"), "muffled" (the theme from the next room),
       "stings" (each in turn), "sfx" (each in turn). solo: one lane. */
    window.FFAudio._render = async function (what, seconds, solo) {
        const sr = 44100;
        const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
        const live = A, wasMuffled = muffled, wasMusic = musicOn, wasSound = soundOn, wasTrk = trk;
        musicOn = soundOn = true;
        muffled = what === "muffled";
        const name = what === "song" || what === "muffled" ? "theme" : what;
        if (TRACKS[name]) trk = TRACKS[name];
        A = build(off);
        A.master.gain.value = 1;     // previews and measurements at full, whatever the slider says
        try {
            Object.keys(A.lanes).forEach(k => { A.lanes[k].gain.value = solo && k !== solo ? 0 : trk.mix[k]; });
            if (TRACKS[name]) {
                for (let i = 0, at = 0.05; at < seconds; i++, at += trk.six) book(at, i);
            } else if (what === "stings") {
                let at = 0.3;
                ["clear", "lost", "won", "over"].forEach(n => { at += STINGS[n](at) + 0.6; });
            } else if (what === "sfx") {
                const seq = [["fall"], ["land"], ["land", true], ["seat", 1], ["seat", 2], ["seat", 3], ["seat", 4], ["seat", 8],
                    ["wrong"], ["decoy"], ["poi"], ["tick"], ["tick"], ["tick", true], ["count"], ["count"], ["count"], ["count", true]];
                seq.forEach(([n, arg], k) => SFX[n](0.3 + k * 0.6, arg));
            }
            return await off.startRendering();
        } finally {
            A = live; muffled = wasMuffled; musicOn = wasMusic; soundOn = wasSound; trk = wasTrk;
        }
    };
    /* One lead voice alone, playing the bossa's verse at `oct` octaves from
       where it is written, through the lead lane at unity — to level a voice
       against another, on the same notes. */
    window.FFAudio._voice = async function (voice, oct, seconds) {
        const sr = 44100, secs = seconds || 12;
        const off = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
        const live = A, wasMusic = musicOn;
        musicOn = true;
        A = build(off);
        A.master.gain.value = 1;     // at full, as _render
        try {
            Object.keys(A.lanes).forEach(k => { A.lanes[k].gain.value = k === "lead" ? 1 : 0; });
            const six = 15 / 100;
            let at = 0.1;
            for (const line of SECTIONS.BOS_A.lead) {
                bar(line).forEach((ev, k) => {
                    if (ev) playLead(voice, at + k * six, ev.len * six * 0.95, hz(ev.note + 12 * (oct || 0)));
                });
                at += 16 * six;
                if (at > secs - 2) break;
            }
            return await off.startRendering();
        } finally {
            A = live; musicOn = wasMusic;
        }
    };
    // Peak and loudness (RMS, dBFS) of a rendered buffer.
    window.FFAudio._measure = function (buf) {
        let peak = 0, sum = 0, n = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; n++; }
        }
        const db = (x) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10;
        return { peak: db(peak), rms: db(Math.sqrt(sum / n)) };
    };
    window.FFAudio._wav = function (buf) {
        const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
        const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
        const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
        str(0, "RIFF"); out.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE");
        str(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
        out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
        str(36, "data"); out.setUint32(40, len * ch * 2, true);
        const data = [];
        for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
        let o = 44;
        for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
            const v = Math.max(-1, Math.min(1, data[c][i]));
            out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
            o += 2;
        }
        return new Blob([out.buffer], { type: "audio/wav" });
    };
})();

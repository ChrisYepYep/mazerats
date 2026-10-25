/* Rat Race's soundtrack and sound effects (11 Oct 2026) — an original
   tune, played live, on the same lines as Pura Panic's (pura-music.js).

   THE STYLE (11 Oct 2026, the owner's: "like Labyrinth Zone" from the first
   Sonic, then "the same STYLE, that catchy thumping beat", then "more
   punchy, more adventure and mystery"). Not a NES square-wave chiptune but
   the Mega Drive's sound: its YM2612 chip made notes by FM — one sine wave
   (the modulator) wobbling the pitch of another (the carrier) so fast that
   the wobble becomes tone colour. Each voice here is that, two operators:

       modulator (sine, freq × ratio) → gain (the "index": how hard it
       wobbles, with its own envelope) → carrier.frequency → amp envelope

       slap bass   ratio 1, the index starting high and dying in 90ms (the
                   pluck), a pitch blip down onto the note, gated short
       muted bass  the same, soft and short: the mystery section's pulse
       brass       ratio 1, the index swelling as the note opens: the hook
       stabs       brass chords cut off short, on the offbeats
       bell        ratio 3.5, struck and dying
       tines       ratio 14, very short: Ice's sparkle

   …through an echo (a delay fed back into itself through a low-pass, so
   each repeat is duller): the wet, submerged sound. The drums are the drum
   machine those games sampled, made to hit hard: a kick that is mostly
   click and a short deep thud (160 → 40Hz in 50ms), a snare that is a
   bright crack and a tight body, the hats kept down under them, a crash on
   the downbeat of each section, and a fill into every section change.

   Its character, none of its notes: a minor key, something old and
   drowned. The melody, chords and bassline are this file's own.

   THE FORM. Three sections, round and round (20 bars):
       A  mystery (8)    bells alone over a muted bass and a steady kick: a
                         two-bar motif that leans on the F# (the tritone
                         from C), passing through Db (the flat II), B and
                         F# diminished sevenths, and sus chords that resolve
                         late — a hidden passage. Toms into B.
       B  adventure (8)  the hook on full brass, all wide leaps (up a fifth,
                         a fourth, to the octave), C Dorian (its major F,
                         with the raised sixth A) and the harmonic minor's
                         leading tone on the G; brass stabs on the "and" of
                         two and four; a brass countermelody in the second
                         half; the bells answering in the gaps. A snare roll
                         into C.
       C  breakdown (4)  two bars of drums and echoing bells, then two of
                         build: the bass pumping a G pedal in sixteenths,
                         four-on-the-floor, a snare roll growing, and the
                         brass climbing a diminished sequence into the
                         crash that starts A again.
   Every second time round A fills out (sixteenth hats, octaves in the
   bass, a stab on the "and" of four) and the bells double B's hook.

   THE TEMPO. Each zone's own, the same in every passage (14 Oct 2026, the
   owner's: no speeding up from passage to passage). 126 on the title.

   ZONES (11 Oct 2026). Every 100m the maze changes, and the band with it:
       1 Wood    as written, but on its own band since 13 Oct (BANDS):
                 a horn section on the hook, a marimba on the motif
       2 Stone   a grittier bass (more index) and extra kicks
       3 Ice     a tine arpeggio two octaves up in sixteenths, a wetter echo
       4 Dark    sparser and lower: brass an octave down, every other bass
                 note, no closed hats, a long echo, and the top dulled

   THE WARNING (11 Oct 2026). When the water is close, an FM alarm climbs
   over the beat and follows how close (danger, 0 to 1): an arpeggio up the
   minor chord in quarters at first, then eighths, then sixteenths, all of
   it higher as the water rises, and a low throb on the beat at the end.

   MUFFLED, as in Pura: the splash and pause screens get the track quieter
   and with its top cut off. THE LAMENT, as in Pura: after the fall, A and
   B (no breakdown) at 66 beats a minute on a soft electric piano, every B
   dropped to Bb and every A to Ab (the leading tone and the Dorian sixth
   gone, so all of it plain minor), the bass a long note a half-bar, no
   drums, a long echo.

   Sound effects go through the same master volume, so muting silences them
   too, and each is a handful of oscillators that stop by themselves —
   cheap enough to call every frame if need be (the frequent ones are rate
   limited besides). They do nothing until the music has been started, nor
   while the clock is paused. Since 12 Oct 2026 Rat Race is a room-by-room
   platformer, and the platformer's effects (jump, land, climb, the key,
   the door, secrets, the act-clear fanfare…) are near the end.

   Browsers will not make a sound until the page has been clicked or tapped,
   so it starts from the Play button and never by itself. */
(function () {
    "use strict";

    const STORE = "mazerats_ratrace_music";
    const VOLUME = 0.16;
    const STEPS = 16;   // sixteenth-notes to a bar

    // ---- the tune. Each bar is sixteen sixteenth-notes: a note, "-" to
    // hold the one before, "." for a rest. Flats are written "b" (Eb5).

    // A, mystery: the bell motif.
    const A_LEAD = [
        "G5 . . . Eb5 . . . . . F#5 . G5 . . .",
        "Ab5 . . . F5 . . . . . . . C5 . . .",
        "Ab5 . . . F5 . . . D5 . . . B4 . . .",
        "C5 . . . . . . . F5 . . . Eb5 . . .",
        "G5 . . . Eb5 . . . . . F#5 . G5 . . .",
        "A5 . . . F#5 . . . . . Eb5 . C5 . . .",
        "C5 . . . . . D5 . . . . . G5 . . .",
        "B4 . . . . . . . . . . . . . . ."
    ];
    const A_CHORDS = ["Cm", "Db", "Bdim7", "Csus Cm", "Ab", "F#dim7", "Gsus", "G"];

    // B, adventure: the hook (brass), its answers (bells), the countermelody.
    const B_LEAD = [
        "C5 - - G5 - - C6 - . Bb5 - G5 . F5 - G5",
        "A5 - - - F5 - C5 - . . . . . . . .",
        "C5 - - Ab5 - - C6 - . Bb5 - Ab5 . G5 - Ab5",
        "Bb5 - - - F5 - D5 - . . . . . . . .",
        "C5 - - G5 - - C6 - . D6 - Eb6 . D6 - C6",
        "A5 - - - C6 - F6 - . . . . Eb6 - D6 -",
        "C6 - - Ab5 - - Eb5 - D5 - - F5 - - Bb5 -",
        "B5 - - - G5 - - - D5 - G5 - B5 - D6 -",
        /* THE HOOK, LONGER (13 Oct 2026, the owner's: "I really like the main
           lead part ... make it longer"): an answering phrase of eight more
           bars, the same rhythm climbing higher (Ab, Bb, Eb, Cm, Fm, G), and
           home again on G for the breakdown, as the first eight came. */
        "Eb6 - - C6 - - Ab5 - . Bb5 - C6 . Eb6 - F6",
        "D6 - - - Bb5 - F5 - . . . . . . . .",
        "Eb6 - - Bb5 - - G5 - . Ab5 - Bb5 . C6 - D6",
        "Eb6 - - - C6 - G5 - . . . . . . . .",
        "F6 - - C6 - - Ab5 - . C6 - F6 . Eb6 - D6",
        "D6 - - - B5 - G5 - . . . . G5 - B5 -",
        "C6 - - Ab5 - - Eb5 - F5 - - Ab5 - - D6 -",
        "G5 - - - - - - - D5 - G5 - B5 - D6 -"
    ];
    const B_BELL = [
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . C6 . A5 . F5 .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . D6 . F6 . Bb5 .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . A5 . C6 . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . F6 . D6 . Bb5 .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . G6 . Eb6 . C6 .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . ."
    ];
    const B_COUNTER = [
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        "Eb4 - - - - - - - G4 - - - - - - -",
        "C5 - - - - - - - A4 - - - - - - -",
        "Ab4 - - - - - - - Bb4 - - - - - - -",
        "B4 - - - - - - - D5 - - - - - - -",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        ". . . . . . . . . . . . . . . .",
        "F4 - - - - - - - Ab4 - - - - - - -",
        "G4 - - - - - - - B4 - - - - - - -",
        "Ab4 - - - - - - - Bb4 - - - - - - -",
        "B4 - - - - - - - D5 - - - - - - -"
    ];
    const B_CHORDS = ["Cm", "F", "Ab", "Bb", "Cm", "F", "Ab Bb", "G", "Ab", "Bb", "Eb", "Cm", "Fm", "G", "Ab Bb", "G"];

    // C, breakdown and build: two bars of bells, two of climbing brass.
    const C_LEAD = [
        "G5 . . . . . . . F#5 . . . . . . .",
        "Eb5 . . . . . . . D5 . . . . . . .",
        "G4 - D5 - G4 - D5 - A4 - Eb5 - A4 - Eb5 -",
        "B4 - F5 - B4 - F5 - D5 - Ab5 - B5 - D6 -"
    ];
    const C_CHORDS = ["Cm", "Ab", "G", "G"];
    const BLANK = new Array(8).fill(". . . . . . . . . . . . . . . .");

    // root: the bass's note; tones: the chord, for stabs and arpeggios;
    // top: the interval the bass's "7" plays (kept inside the key).
    const CHORDS = {
        Cm: { root: 36, tones: [60, 63, 67], top: 10 },
        Csus: { root: 36, tones: [60, 65, 67], top: 10 },
        Db: { root: 37, tones: [61, 65, 68], top: 11 },
        "Bdim7": { root: 47, tones: [59, 62, 65, 68], top: 9 },
        "F#dim7": { root: 42, tones: [57, 60, 63, 66], top: 9 },
        F: { root: 41, tones: [60, 65, 69], top: 10 },
        Gsus: { root: 43, tones: [60, 62, 67], top: 10 },
        G: { root: 43, tones: [62, 67, 71], top: 10 },
        Ab: { root: 44, tones: [60, 63, 68], top: 11 },
        Bb: { root: 46, tones: [62, 65, 70], top: 10 },
        Eb: { root: 39, tones: [63, 67, 70], top: 10 },
        Fm: { root: 41, tones: [60, 65, 68], top: 10 }
    };
    /* The bass, by groove: R root, O octave, 5 fifth, 7 the chord's "top",
       x a dead (muted, percussive) note, "-" hold, "." rest. */
    const GROOVES = {
        M1: "R . . . . . R . R . . . . . . .",
        M2: "R . . . . . R . R . . O . . 5 .",
        D1: "R - O R . x R O . R O . R x O 5",
        D2: "R . O R . R O . R . O R x 5 O 7",
        SUB: "R . . . . . . . R . . . . . . .",
        PEDAL: "R O R O R O R O R O R O R O R O",
        PULSE: "R . R . R . R . R . R . R . R .",
        ARP: "R O 5 O R O 5 O R O 5 O R O 7 O"
    };
    /* Each section, bar by bar: which voice plays the lead, which groove
       and bass voice, which drum pattern. */
    const SECTIONS = {
        A: {
            name: "A", bars: 8, lead: A_LEAD, answer: BLANK, counter: BLANK, chords: A_CHORDS,
            voice: Array(8).fill("bell"), groove: Array(8).fill("M1"), bassVoice: Array(8).fill("muted"),
            drums: Array(8).fill("steady"), fill: "toms"
        },
        B: {
            name: "B", bars: 16, lead: B_LEAD, answer: B_BELL, counter: B_COUNTER, chords: B_CHORDS,
            voice: Array(16).fill("brass"), groove: Array(16).fill(0).map((_, i) => (i % 2 ? "D2" : "D1")), bassVoice: Array(16).fill("slap"),
            drums: Array(16).fill("full"), fill: "roll"
        },
        C: {
            name: "C", bars: 4, lead: C_LEAD, answer: BLANK, counter: BLANK, chords: C_CHORDS,
            voice: ["bell", "bell", "brass", "brass"], groove: ["SUB", "SUB", "PEDAL", "PEDAL"], bassVoice: ["muted", "muted", "slap", "slap"],
            drums: ["break", "break", "build", "build"], fill: null
        }
    };
    const FORM = [SECTIONS.A, SECTIONS.B, SECTIONS.C];
    const SAD_FORM = [SECTIONS.A, SECTIONS.B];
    /* THE TITLE (13 Oct 2026: "doesn't have the build-up and lead parts, and
       therefore it can be less dimmed down"): the mystery section alone,
       round and round, open rather than muffled, a little under full. */
    const TITLE_FORM = [SECTIONS.A];
    let titleOnly = false;

    /* ================================================================ THE ZONES' OWN TUNES
       (13 Oct 2026, the owner's: "catchy tunes whilst still carrying the
       theme and atmosphere of the zone"). Each in the same three sections as
       the Wood's (A the mystery, B the hook, C the breakdown and build), each
       its own key, tempo, band and groove:

         2 STONE QUARRY   D minor, 132. A work song: an anvil rings out the
                          motif in hammer-blow rhythms; the hook on a bright
                          plucked clavinet doubled by brass, climbing in
                          thirds; a gritty bass and extra kicks.
         3 ICE CAVERNS    E minor, 116. Glass and air: a celesta spinning
                          arpeggios for the motif; the hook a breathy flute,
                          long notes and a lift to the high E; glass tines
                          answering; a soft bass and the tines in sixteenths.
         4 DARK DEPTHS    A minor (Phrygian, the flat second), 96. A slow
                          heartbeat kick; a low bell tolls the four-note motif
                          (A, C, B flat, E); the hook an ocarina, plaintive,
                          bending down to the leading tone; a choir under it.
         5 THE STATION    F minor, 138. Under the sea: a sonar ping for the
                          motif; a pulsing synth bass in octaves; the hook a
                          bright synth lead in driving repeated notes; four on
                          the floor through the hook.
         6 THE HEART      C major, 128. The secret level at the very end: the
                          Wood's horns and marimba, the Wood's own hook turned
                          major, in triumph.                                    */
    const songs = {};
    const blank8 = (rows) => rows.map(r => r || BLANK[0]);
    function makeSong(d) {
        const A = { name: "A", bars: 8, lead: d.A_LEAD, answer: BLANK, counter: BLANK, chords: d.A_CHORDS, voice: Array(8).fill(d.leadAll ? "brass" : "bell"), groove: Array(8).fill(d.grooveA || "M1"), bassVoice: Array(8).fill(d.bassA || "muted"), drums: Array(8).fill("steady"), fill: "toms" };
        const B = { name: "B", bars: 8, lead: d.B_LEAD, answer: blank8(d.B_ANSWER), counter: blank8(d.B_COUNTER), chords: d.B_CHORDS, voice: Array(8).fill("brass"), groove: d.grooveB || ["D1", "D2", "D1", "D2", "D1", "D2", "D1", "D2"], bassVoice: Array(8).fill("slap"), drums: Array(8).fill("full"), fill: "roll" };
        const C = { name: "C", bars: 4, lead: d.C_LEAD, answer: BLANK, counter: BLANK, chords: d.C_CHORDS, voice: d.cVoice || (d.leadAll ? Array(4).fill("brass") : ["bell", "bell", "brass", "brass"]), groove: ["SUB", "SUB", "PEDAL", "PEDAL"], bassVoice: ["muted", "muted", "slap", "slap"], drums: ["break", "break", "build", "build"], fill: null };
        if (d.leadAll) for (const sec of [A, C]) sec.lead = sec.lead.map(bar => { let on = false; return bar.trim().split(/\s+/).map(t => (t === "." && on) ? "-" : (on = on || t !== ".", t)).join(" "); });
        for (const sec of [A, B, C]) {
            for (const k of ["lead", "answer", "counter"]) sec[k].forEach((bar, i) => { if (bar.trim().split(/\s+/).length !== STEPS) throw new Error("Scout's Trail music: zone " + d.zone + " " + sec.name + " " + k + " bar " + (i + 1) + " is not 16 steps"); });
            sec.leadSteps = sec.lead.map(parseBar); sec.answerSteps = sec.answer.map(parseBar); sec.counterSteps = sec.counter.map(parseBar);
        }
        songs[d.zone] = { form: [A, B, C], tempo: d.tempo };
    }

    // The warning's arpeggio, up the minor chord and on.
    const ALARM = [0, 3, 7, 12, 15, 19, 24, 27];

    const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
    function midi(name) {
        const m = /^([A-G][#b]?)(\d)$/.exec(name || "");
        return m && m[1] in NOTE ? 12 * (Number(m[2]) + 1) + NOTE[m[1]] : null;
    }
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

    // A bar as sixteen steps: { note, len } at a step, or null.
    function parseBar(bar) {
        const t = bar.trim().split(/\s+/);
        const out = new Array(STEPS).fill(null);
        for (let i = 0; i < STEPS; i++) {
            const n = midi(t[i]);
            if (n === null) continue;
            let len = 1;
            while (i + len < STEPS && t[i + len] === "-") len++;
            out[i] = { note: n, len };
        }
        return out;
    }
    const IV = { R: 0, O: 12, 5: 7 };
    function parseGroove(g) {
        const t = g.trim().split(/\s+/);
        const out = new Array(STEPS).fill(null);
        for (let i = 0; i < STEPS; i++) {
            const c = t[i];
            if (c === "." || c === "-" || !c) continue;
            let len = 1;
            while (i + len < STEPS && t[i + len] === "-") len++;
            out[i] = { iv: c in IV ? IV[c] : c === "7" ? "top" : 0, len, dead: c === "x" };
        }
        return out;
    }
    FORM.forEach(s => {
        s.leadSteps = s.lead.map(parseBar);
        s.answerSteps = s.answer.map(parseBar);
        s.counterSteps = s.counter.map(parseBar);
    });
    const GROOVE_STEPS = {};
    Object.keys(GROOVES).forEach(k => { GROOVE_STEPS[k] = parseGroove(GROOVES[k]); });

    /* 2 THE STONE QUARRY, THIRD TIME (14 Oct 2026, the owner's: "a mechanic
       thumping beat and catchy hook"). G minor, 118. The motif clanged out on a
       steel pipe in a machine's rhythm; the hook a driven organ, a riff to hum;
       the bass pumping octaves; the drums a steam engine. */
    makeSong({
        zone: 12, tempo: 118,   // (23 Oct 2026: moved from 2, kept as the backup; the Quarry plays the folk song below)
        A_CHORDS: ["Gm", "Gm", "Eb", "D", "Gm", "Gm", "C", "D"],
        A_LEAD: [
            "G4 . . G4 . . D5 . G4 . . G4 . . Bb4 .",
            "G4 . . G4 . . D5 . C5 . Bb4 . A4 . . .",
            "Eb4 . . Eb4 . . Bb4 . Eb4 . . Eb4 . . G4 .",
            "D4 . . D4 . . A4 . D5 . . C5 . A4 . .",
            "G4 . . G4 . . D5 . G4 . . G4 . . Bb4 .",
            "G4 . . G4 . . D5 . G5 . F5 . D5 . . .",
            "C5 . . C5 . . G5 . Eb5 . . C5 . . G4 .",
            "D5 . . . F#4 . . . A4 . . . D5 . . ."
        ],
        B_CHORDS: ["Gm", "Eb", "F", "D", "Gm", "Eb", "F D", "Gm"],
        B_LEAD: [
            "G5 - - G5 - . Bb5 - C6 - - . D6 - C6 -",
            "Bb5 - - - G5 - - - Eb5 - - - . . . .",
            "F5 - - F5 - . A5 - C6 - - . A5 - F5 -",
            "A5 - - - - - - - F#5 - - - D5 - - -",
            "G5 - - G5 - . Bb5 - C6 - - . D6 - C6 -",
            "Bb5 - - - G5 - Bb5 - Eb6 - - - D6 - C6 -",
            "C6 - - A5 - - F5 - D6 - - - A5 - F#5 -",
            "G5 - - - - - - - . . . . D5 - G5 -"
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . G5 . Bb5 .", null, ". . . . . . . . . . . . A5 . C6 .", null, null, null, null],
        B_COUNTER: [null, null, null, null, "D5 - - - - - - - - - - - - - - -", "Eb5 - - - - - - - G5 - - - - - - -", "F5 - - - - - - - F#5 - - - - - - -", "D5 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Eb", "F", "D", "D"],
        C_LEAD: ["G5 . . . . . . . F5 . . . . . . .", "Eb5 . . . . . . . D5 . . . . . . .", "D4 - A4 - D5 - A4 - D4 - A4 - D5 - F#5 -", "A4 - D5 - F#5 - A5 - D5 - F#5 - A5 - D6 -"]
    });
    /* 2 THE STONE QUARRY, FOURTH TIME (23 Oct 2026, the owner's: "make a new soundtrack for the quarry that is inspired by
       the Witcher 3 soundtrack"; the machine kept as the backup, zone 12). Slavic dark folk, its own notes. D minor (the old
       modes: the flat seventh, the A major only where it turns home), 112, in the 3+3+2 of the dances.
         A  the kantele plucking the motif over the hurdy-gurdy's drones, the war drum on one and three
         B  the hook on the hurdy-gurdy, the fiddle an octave over it; the war drums and cellos driving the 3+3+2; the men's
            choir under; the kantele answering; the second time round the woman's voice joins the hook
         C  the woman's voice alone over the drones and a drum, then the hurdy-gurdy climbing over the cellos into A */
    makeSong({
        zone: 2, tempo: 112, cVoice: ["voice", "voice", "brass", "brass"],
        A_CHORDS: ["Dm", "Dm", "C", "Dm", "Gm", "C", "Dm", "A"],
        A_LEAD: [
            "D5 . . D5 . . F5 . E5 . . D5 . . C5 .",
            "D5 . . . . . A4 . . . . . . . . .",
            "C5 . . C5 . . E5 . D5 . . C5 . . Bb4 .",
            "A4 . . . . . D5 . . . . . . . . .",
            "D5 . . D5 . . F5 . G5 . . F5 . . D5 .",
            "E5 . . E5 . . C5 . . . . . . . . .",
            "D5 . . F5 . . A5 . G5 . F5 . E5 . D5 .",
            "C#5 . . . . . E5 . . . . . A4 . . ."
        ],
        B_CHORDS: ["Dm", "C", "Bb", "A", "Dm", "C", "Bb A", "Dm"],
        B_LEAD: [
            "A5 - - A5 - - D6 - C6 - - A5 - - G5 -",
            "E5 - - - - - G5 - C6 - - - . . . .",
            "F5 - - F5 - - Bb5 - A5 - - G5 - - F5 -",
            "E5 - - - - - C#5 - E5 - - - A5 - - -",
            "A5 - - A5 - - D6 - E6 - - F6 - - E6 -",
            "E6 - - D6 - - C6 - G5 - - - C6 - - -",
            "D6 - - Bb5 - - F5 - E5 - - C#6 - - - -",
            "D6 - - - - - - - . . . . A5 - D6 -"
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . E6 . D6 .", null, null, null, null, null, ". . . . . . . . D6 . F6 . . . . ."],
        B_COUNTER: [null, null, null, null, "D4 - - - - - - - - - - - - - - -", "E4 - - - - - - - G4 - - - - - - -", "F4 - - - - - - - E4 - - - - - - -", "D4 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Dm", "Bb", "Gm", "A"],
        C_LEAD: ["A5 - - - - - - - G5 - - F5 - - E5 -", "D5 - - - - - - - F5 - - - - - - -", "G5 - - Bb5 - - D6 - C6 - - Bb5 - - A5 -", "A5 - - - C#6 - - - E6 - - - A6 - - -"]
    });
    makeSong({
        zone: 3, tempo: 116,
        A_CHORDS: ["Em", "Cmaj7", "Am", "B", "Em", "Cmaj7", "Am D", "B"],
        A_LEAD: [
            "E6 . B5 . G5 . B5 . E6 . . . D6 . B5 .",
            "C6 . G5 . E5 . G5 . B5 . . . A5 . G5 .",
            "A5 . E5 . C5 . E5 . A5 . . . B5 . C6 .",
            "B5 . F#5 . D#5 . F#5 . B5 . . . . . . .",
            "E6 . B5 . G5 . B5 . E6 . . . F#6 . G6 .",
            "G6 . E6 . C6 . E6 . G6 . . . F#6 . E6 .",
            "C6 . A5 . E5 . A5 . D6 . A5 . F#5 . A5 .",
            "D#6 . . . B5 . . . F#5 . . . . . . ."
        ],
        B_CHORDS: ["Em", "C", "G", "D", "Em", "C", "Am B", "Em"],
        B_LEAD: [
            "B5 - - - G5 - A5 - B5 - - - E6 - D6 -",
            "C6 - - - - - B5 - A5 - G5 - . . . .",
            "D6 - - - B5 - C6 - D6 - - - G6 - F#6 -",
            "F#6 - - - - - E6 - D6 - - - . . . .",
            "B5 - - - G5 - A5 - B5 - - - E6 - G6 -",
            "G6 - - - - - F#6 - E6 - D6 - E6 - . .",
            "C6 - - - B5 - A5 - D#6 - - - F#6 - . .",
            "E6 - - - - - - - . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . E6 . B6 .", null, ". . . . . . . . . . . . A6 . F#6 .", null, ". . . . . . . . . . . . . . B6 .", null, null],
        B_COUNTER: [null, null, null, null, "G4 - - - - - - - - - - - - - - -", "E4 - - - - - - - - - - - - - - -", "A4 - - - - - - - B4 - - - - - - -", "G4 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Am", "C", "B", "B"],
        C_LEAD: ["E6 . . . . . . . C6 . . . . . . .", "G6 . . . . . . . E6 . . . . . . .", "B4 - F#5 - B4 - F#5 - D#5 - A5 - D#5 - A5 -", "F#5 - B5 - F#5 - B5 - D#6 - F#6 - B5 - D#6 -"]
    });
    makeSong({
        /* (13 Oct 2026, the owner's: "the lead should be the main focus, the
           bass overwhelms it ... more like the main lead part throughout")
           The ocarina leads every section; the bass only a soft note at the
           start of each bar. */
        zone: 4, tempo: 96, leadAll: true,
        A_CHORDS: ["Am", "Bb", "Am", "E", "Am", "Bb", "F E", "E"],
        A_LEAD: [
            "A4 . . C5 . . Bb4 . . . . . E4 . . .",
            "F4 . . A4 . . Bb4 . . . D5 . . . . .",
            "A4 . . C5 . . Bb4 . . . . . A4 . . .",
            "G#4 . . . B4 . . . E5 . . . . . . .",
            "A4 . . C5 . . Bb4 . . . . . E4 . . .",
            "F4 . . A4 . . Bb4 . . . F5 . E5 . D5 .",
            "C5 . . A4 . . F4 . G#4 . . . B4 . . .",
            "E5 . . . . . . . . . . . . . . ."
        ],
        B_CHORDS: ["Am", "F", "G", "E", "Am", "F", "Dm E", "Am"],
        B_LEAD: [
            "E5 - - - F5 - E5 - D5 - C5 - . . B4 -",
            "C5 - - - - - A4 - . . . . . . . .",
            "D5 - - - E5 - D5 - C5 - B4 - . . G4 -",
            "G#4 - - - - - - - B4 - - - E5 - - -",
            "E5 - - - F5 - E5 - D5 - C5 - . . E5 -",
            "A5 - - - - - G5 - F5 - E5 - . . . .",
            "F5 - - - E5 - D5 - E5 - - - G#5 - . .",
            "A5 - - - - - - - . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . A5 . . . E5 .", null, null, null, ". . . . . . . . . . . . A4 . C5 .", null, null],
        B_COUNTER: [null, null, null, null, "C4 - - - - - - - - - - - - - - -", "A3 - - - - - - - - - - - - - - -", "A3 - - - - - - - G#3 - - - - - - -", "A3 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Am", "Bb", "E", "E"],
        C_LEAD: ["A5 . . . . . . . Bb5 . . . . . . .", "A5 . . . . . . . G#5 . . . . . . .", "E4 - B4 - E4 - B4 - G#4 - D5 - G#4 - D5 -", "B4 - E5 - B4 - E5 - G#5 - B5 - E5 - G#5 -"]
    });
    makeSong({
        zone: 5, tempo: 138, grooveA: "PULSE", bassA: "slap", grooveB: Array(8).fill("ARP"),
        A_CHORDS: ["Fm", "Fm", "Db", "Eb", "Fm", "Fm", "Bbm", "C"],
        A_LEAD: [
            "F5 . . . . . . . . . . . C6 . . .",
            "Ab5 . . . . . . . G5 . . . . . . .",
            "F5 . . . . . . . . . . . Db6 . . .",
            "Eb6 . . . . . . . Bb5 . . . . . . .",
            "F5 . . . . . . . . . . . C6 . . .",
            "Ab5 . . . . . . . C6 . . . Eb6 . . .",
            "Db6 . . . . . . . Bb5 . . . F5 . . .",
            "E5 . . . . . . . G5 . . . C6 . . ."
        ],
        B_CHORDS: ["Fm", "Db", "Ab", "Eb", "Fm", "Db", "Bbm C", "Fm"],
        B_LEAD: [
            "C6 - . C6 - . Ab5 - . F5 - . G5 - Ab5 -",
            "F5 - - - . . Db5 - . F5 - Ab5 - . . .",
            "C6 - . C6 - . Eb6 - . C6 - . Ab5 - Bb5 -",
            "G5 - - - . . Eb5 - . G5 - Bb5 - . . .",
            "C6 - . C6 - . Ab5 - . F5 - . G5 - Ab5 -",
            "Bb5 - - - Ab5 - F5 - . Db6 - - C6 - Bb5 -",
            "Ab5 - . F5 - . Db5 - E5 - . G5 - . C6 -",
            "F5 - - - - - . . . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . F6 . C6 .", null, ". . . . . . . . . . . . Eb6 . Bb5 .", null, null, null, ". . . . . . . . F6 . Eb6 . C6 . Ab5 ."],
        B_COUNTER: [null, null, null, null, "Ab4 - - - - - - - C5 - - - - - - -", "F4 - - - - - - - Ab4 - - - - - - -", "F4 - - - - - - - E4 - - - - - - -", "F4 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Fm", "Db", "C", "C"],
        C_LEAD: ["C6 . . . . . . . Bb5 . . . . . . .", "Ab5 . . . . . . . G5 . . . . . . .", "C5 - G5 - C5 - G5 - E5 - Bb5 - E5 - Bb5 -", "G5 - C6 - G5 - C6 - E6 - G6 - C6 - E6 -"]
    });
    makeSong({
        zone: 6, tempo: 128,
        A_CHORDS: ["C", "Am", "F", "G", "C", "Am", "F G", "G"],
        A_LEAD: [
            "G5 . . . E5 . . . . . F5 . G5 . . .",
            "A5 . . . E5 . . . . . . . C5 . . .",
            "A5 . . . F5 . . . C5 . . . A4 . . .",
            "B4 . . . D5 . . . G5 . . . . . . .",
            "G5 . . . E5 . . . . . F5 . G5 . . .",
            "A5 . . . E5 . . . . . G5 . E5 . . .",
            "F5 . . . A5 . . . D5 . . . G5 . . .",
            "G5 . . . . . . . . . . . . . . ."
        ],
        B_CHORDS: ["C", "F", "Am", "G", "C", "F", "F G", "C"],
        B_LEAD: [
            "C5 - - G5 - - C6 - . B5 - G5 . F5 - G5",
            "A5 - - - F5 - C5 - . . . . . . . .",
            "C5 - - A5 - - C6 - . B5 - A5 . G5 - A5",
            "B5 - - - G5 - D5 - . . . . . . . .",
            "C5 - - G5 - - C6 - . D6 - E6 . D6 - C6",
            "A5 - - - C6 - F6 - . . . . E6 - D6 -",
            "C6 - - A5 - - F5 - D5 - - G5 - - B5 -",
            "C6 - - - G5 - - - E5 - G5 - C6 - E6 -"
        ],
        B_ANSWER: [null, ". . . . . . . . . . C6 . A5 . F5 .", null, ". . . . . . . . . . D6 . B5 . G5 .", null, ". . . . . . . . A5 . C6 . . . . .", null, null],
        B_COUNTER: [null, null, null, null, "E4 - - - - - - - G4 - - - - - - -", "C5 - - - - - - - A4 - - - - - - -", "A4 - - - - - - - B4 - - - - - - -", "C5 - - - - - - - E5 - - - - - - -"],
        C_CHORDS: ["Am", "F", "G", "G"],
        C_LEAD: ["E5 . . . . . . . D5 . . . . . . .", "C5 . . . . . . . A4 . . . . . . .", "G4 - D5 - G4 - D5 - B4 - F5 - B4 - F5 -", "D5 - G5 - D5 - G5 - B5 - D6 - G5 - B5 -"]
    });
    /* 7 THE CLOCKWORK VAULT (14 Oct 2026). D major, 100 (the beat the vault
       keeps: 36 frames). A music box turning gears of arpeggios; a clarinet
       for the hook, whimsical; tick and tock on a woodblock, a ratchet. */
    makeSong({
        zone: 7, tempo: 100,
        A_CHORDS: ["D", "Bm", "G", "A", "D", "Bm", "Em", "A"],
        A_LEAD: [
            "D5 . F#5 . A5 . F#5 . D6 . A5 . F#5 . A5 .",
            "B4 . D5 . F#5 . D5 . B5 . F#5 . D5 . F#5 .",
            "G4 . B4 . D5 . B4 . G5 . D5 . B4 . D5 .",
            "A4 . C#5 . E5 . C#5 . A5 . . . G5 . E5 .",
            "D5 . F#5 . A5 . F#5 . D6 . A5 . F#5 . A5 .",
            "B4 . D5 . F#5 . D5 . B5 . D6 . E6 . F#6 .",
            "E6 . D6 . B5 . G5 . E5 . G5 . B5 . E6 .",
            "C#6 . . . A5 . . . E5 . . . . . . ."
        ],
        B_CHORDS: ["G", "A", "F#m", "Bm", "G", "A", "D A", "D"],
        B_LEAD: [
            "B5 - - A5 - - G5 - F#5 - - - E5 - D5 -",
            "E5 - - - - - C#5 - A4 - - - . . . .",
            "A5 - - G5 - - F#5 - E5 - - - D5 - C#5 -",
            "D5 - - - B4 - - - . . . . F#5 - A5 -",
            "B5 - - A5 - - G5 - F#5 - - - E5 - D5 -",
            "E5 - - - F#5 - G5 - A5 - - - . . B5 -",
            "A5 - - F#5 - - D5 - E5 - - - C#5 - . .",
            "D5 - - - - - - - . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . E6 . A6 .", null, ". . . . . . . . D6 . F#6 . . . . .", null, null, null, ". . . . . . . . A5 . D6 . F#6 . A6 ."],
        B_COUNTER: [null, null, null, null, "D5 - - - - - - - C#5 - - - - - - -", "C#5 - - - - - - - E5 - - - - - - -", "D5 - - - - - - - E5 - - - - - - -", "F#4 - - - - - - - A4 - - - - - - -"],
        C_CHORDS: ["Bm", "G", "A", "A"],
        C_LEAD: ["F#5 . . . . . . . E5 . . . . . . .", "D5 . . . . . . . B4 . . . . . . .", "A4 - C#5 - E5 - A5 - A4 - C#5 - E5 - A5 -", "E5 - A5 - C#6 - E6 - A5 - C#6 - E6 - A6 -"]
    });
    /* 8 THE SANDFALL TOMB. E Phrygian dominant (the raised third over the
       flat second), 108. An oud sliding into its notes; a ney for the hook,
       breath and all; a drone held under; the darbuka's maqsum. */
    makeSong({
        zone: 8, tempo: 108,
        A_CHORDS: ["E", "F", "E", "Dm", "E", "F", "G F", "E"],
        A_LEAD: [
            "E5 . F5 . G#5 . F5 . E5 . . . B4 . . .",
            "F5 . E5 . F5 . A5 . G#5 . F5 . E5 . . .",
            "E5 . F5 . G#5 . A5 . B5 . A5 . G#5 . F5 .",
            "D5 . F5 . A5 . F5 . D5 . . . . . . .",
            "E5 . F5 . G#5 . F5 . E5 . . . B4 . . .",
            "F5 . A5 . C6 . A5 . G#5 . F5 . E5 . F5 .",
            "G5 . F5 . E5 . D5 . F5 . E5 . D5 . C5 .",
            "B4 . . . G#4 . . . E4 . . . . . . ."
        ],
        B_CHORDS: ["Am", "G", "F", "E", "Am", "G", "F E", "E"],
        B_LEAD: [
            "A5 - - - C6 - B5 - A5 - - - G#5 - - -",
            "G5 - - - B5 - A5 - G5 - - - F5 - - -",
            "F5 - - - A5 - G#5 - F5 - E5 - D5 - - -",
            "E5 - - - - - - - G#5 - - - B5 - - -",
            "A5 - - - C6 - B5 - A5 - - - E6 - - -",
            "D6 - - - C6 - B5 - A5 - G5 - F5 - - -",
            "F5 - - - E5 - F5 - G#5 - - - F5 - E5 -",
            "E5 - - - - - - - . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . E6 . D6 .", null, ". . . . . . . . . . . . E6 . F6 .", null, null, null, ". . . . . . . . E5 . F5 . G#5 . B5 ."],
        B_COUNTER: [null, null, null, null, "C5 - - - - - - - E5 - - - - - - -", "B4 - - - - - - - D5 - - - - - - -", "A4 - - - - - - - G#4 - - - - - - -", "G#4 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["F", "E", "Dm", "E"],
        C_LEAD: ["A5 . . . . . . . G#5 . . . . . . .", "F5 . . . . . . . E5 . . . . . . .", "D5 - F5 - A5 - D6 - D5 - F5 - A5 - D6 -", "E5 - G#5 - B5 - E6 - B5 - G#5 - F5 - E5 -"]
    });
    /* 9 THE STEAMWORKS (14 Oct 2026, written a third time, after the owner's "completely rewrite it",
       pointing to a theme-park ride's score and describing it: industrial pulse, low brass drones and
       mysterious textures building tension; then a soaring, uplifting piece, bright brass and flowing
       strings, the wonder of flight; then driving action, prominent percussion, soaring brass). Its own
       notes, after that shape and nothing else. D minor, 104.
         A  THE WORKS WAKING: an engine's chug, a clock ticking softly, clanks, steam let off; low strings
            held, cellos pulsing; a horn calling in the dark.
         B  FLIGHT: F major; the horn soars over strings running in arpeggios, a choir under it, a
            celesta glinting, timpani.
         C  THE CLIMB: back to D minor, driving: brass stabs, the horn high over them, drums pounding. */
    makeSong({
        zone: 9, tempo: 104, leadAll: false, cVoice: ["brass", "brass", "brass", "brass"],
        A_CHORDS: ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Gm", "A"],
        A_LEAD: [
            "D4 . . . . . . . A4 . . . . . . .",
            "F4 . . . . . . . E4 . . . D4 . . .",
            "D4 . . . . . . . F4 . . . . . . .",
            "E4 . . . . . . . G4 . . . . . . .",
            "D4 . . . . . . . A4 . . . . . . .",
            "C5 . . . . . . . A4 . . . F4 . . .",
            "G4 . . . . . . . Bb4 . . . D5 . . .",
            "C#5 . . . . . . . E5 . . . A4 . . ."
        ],
        B_CHORDS: ["F", "C", "Dm", "Bb", "F", "C", "Bb C", "F"],
        B_LEAD: [
            "C5 - - - F5 - - - A5 - - - - - G5 -",
            "G5 - - - - - - - E5 - - - C5 - - -",
            "D5 - - - F5 - - - A5 - - - D6 - - -",
            "C6 - - - - - - - Bb5 - - - A5 - G5 -",
            "C5 - - - F5 - - - A5 - - - C6 - - -",
            "E6 - - - - - - - D6 - - - C6 - - -",
            "D6 - - - C6 - - - Bb5 - - - G5 - - -",
            "F5 - - - - - - - - - - - . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . C6 . E6 .", null, ". . . . . . . . . . . . F6 . D6 .", null, ". . . . . . . . . . . . G6 . E6 .", null, ". . . . . . . . A5 . C6 . F6 . A6 ."],
        B_COUNTER: ["A4 - - - - - - - - - - - - - - -", "G4 - - - - - - - - - - - - - - -", "F4 - - - - - - - - - - - - - - -", "F4 - - - - - - - - - - - - - - -", "A4 - - - - - - - - - - - - - - -", "G4 - - - - - - - - - - - - - - -", "F4 - - - - - - - G4 - - - - - - -", "A4 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Dm", "Bb", "C", "A"],
        C_LEAD: ["D5 - - D5 - - F5 - A5 - - - G5 - F5 -", "Bb5 - - Bb5 - - A5 - G5 - - - F5 - D5 -", "C6 - - C6 - - Bb5 - A5 - - - G5 - E5 -", "A5 - - - C#6 - - - E6 - - - A6 - - -"]
    });
    /* 10 THE OVERGROWN RUINS. A minor into C, 104. A marimba for the motif,
       a steel pan for the hook; bongos talking, a shaker, a light bass. */
    makeSong({
        zone: 10, tempo: 104,
        A_CHORDS: ["Am", "F", "C", "G", "Am", "F", "Dm", "E"],
        A_LEAD: [
            "A4 . C5 . E5 . A5 . . . G5 . E5 . C5 .",
            "F4 . A4 . C5 . F5 . . . E5 . C5 . A4 .",
            "C5 . E5 . G5 . C6 . . . B5 . G5 . E5 .",
            "G4 . B4 . D5 . G5 . . . F5 . D5 . B4 .",
            "A4 . C5 . E5 . A5 . . . G5 . E5 . C5 .",
            "F4 . A4 . C5 . F5 . . . A5 . C6 . A5 .",
            "D5 . F5 . A5 . D6 . . . C6 . A5 . F5 .",
            "E5 . G#5 . B5 . E6 . . . . . . . . ."
        ],
        B_CHORDS: ["F", "G", "Em", "Am", "F", "G", "E", "Am"],
        B_LEAD: [
            "A5 - - - C6 - - A5 - - G5 - E5 - - -",
            "D6 - - - B5 - - G5 - - - - . . . .",
            "G5 - - - B5 - - E6 - - D6 - B5 - - -",
            "C6 - - - - - - A5 - - - - E5 - G5 -",
            "A5 - - - C6 - - F6 - - E6 - C6 - - -",
            "D6 - - - E6 - - F6 - - E6 - D6 - B5 -",
            "B5 - - - G#5 - - B5 - - D6 - E6 - - -",
            "A5 - - - - - - - . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . G6 . F6 .", null, ". . . . . . . . . . . . E6 . C6 .", null, null, null, ". . . . . . . . A5 . C6 . E6 . A6 ."],
        B_COUNTER: [null, null, null, null, "C5 - - - - - - - A4 - - - - - - -", "B4 - - - - - - - D5 - - - - - - -", "G#4 - - - - - - - B4 - - - - - - -", "C5 - - - - - - - E5 - - - - - - -"],
        C_CHORDS: ["Dm", "F", "E", "E"],
        C_LEAD: ["F5 . . . . . . . A5 . . . . . . .", "C6 . . . . . . . A5 . . . . . . .", "E5 - G#5 - B5 - E6 - E5 - G#5 - B5 - E6 -", "B5 - E6 - G#6 - B6 - E6 - G#6 - B6 - E7 -"]
    });
    /* 11 THE NEON JUNGLE ARCADE, AGAIN (23 Oct 2026, the owner's: "Completely rework the Neon Jungle Arcade soundtrack,
       give it neo tokyo / synthwave vibes"; it was a nineties marimba and breakbeat, 14 Oct). A minor, 108: the
       night-drive's chords (Am, Fmaj7, C, G, the seventh chords of city pop for colour), a DX7's glassy electric piano
       for the motif, a wide supersaw for the hook, sixteenths of plucked arpeggio running under it, the bass pulsing
       octaves in eighths, a pad of detuned saws, a LinnDrum's kick and a gated snare, Simmons toms into each section. */
    makeSong({
        zone: 11, tempo: 108,
        A_CHORDS: ["Am", "Fmaj7", "C", "G", "Am", "Fmaj7", "Dm7", "E"],
        A_LEAD: [
            "A4 . . E5 . . A5 . G5 . E5 . D5 . E5 .",
            "C5 . . A4 . . C5 . E5 . . . D5 . C5 .",
            "G4 . . C5 . . E5 . G5 . . . E5 . D5 .",
            "D5 . . B4 . . D5 . G5 - - - . . . .",
            "A4 . . E5 . . A5 . G5 . E5 . D5 . E5 .",
            "C5 . . A4 . . C5 . E5 . . . G5 . A5 .",
            "F5 . . E5 . . D5 . C5 . . . D5 . E5 .",
            "E5 - - - G#5 - - - B5 - - - . . . ."
        ],
        B_CHORDS: ["Fmaj7", "G", "Em7", "Am", "Fmaj7", "G", "Esus E", "Am"],
        B_LEAD: [
            "A5 - - - - - G5 - A5 - - - C6 - - -",
            "B5 - - - - - A5 - G5 - - - D5 - - -",
            "E5 - - - G5 - - - B5 - - - A5 - G5 -",
            "A5 - - - - - - - . . . . E5 - G5 -",
            "A5 - - - - - G5 - A5 - - - C6 - D6 -",
            "E6 - - - - - D6 - B5 - - - G5 - - -",
            "G#5 - - - - - - - B5 - - - E6 - - -",
            "A5 - - - - - - - . . . . . . . ."
        ],
        B_ANSWER: [null, ". . . . . . . . . . . . E6 . G6 .", null, ". . . . . . . . . . . . C6 . E6 .", null, null, null, ". . . . . . . . A5 . C6 . E6 . A6 ."],
        B_COUNTER: [null, null, null, null, "C5 - - - - - - - - - - - - - - -", "D5 - - - - - - - - - - - - - - -", "E5 - - - - - - - - - - - - - - -", "E5 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Dm7", "Fmaj7", "G", "Esus E"],
        C_LEAD: ["D5 . . . . . . . F5 . . . . . . .", "A5 . . . . . . . E5 . . . . . . .", "G5 - B5 - D6 - G6 - G5 - B5 - D6 - G6 -", "E5 - G#5 - B5 - E6 - B5 - E6 - G#6 - B6 -"]
    });
    /* A chord from its name (13 Oct 2026, for the zones' tunes in other
       keys): a root (C, F#, Bb...) and m, dim, dim7, sus, maj7 or 7 after
       it. The bass's root in the second octave, the tones round middle C,
       and the bass's "7". The Wood's own table first. */
    const chordCache = {};
    function chordOf(name) {
        if (CHORDS[name]) return CHORDS[name];
        if (chordCache[name]) return chordCache[name];
        const m = /^([A-G][#b]?)(m7|m|dim7|dim|sus|maj7|7)?$/.exec(name);
        if (!m) return CHORDS.Cm;
        const pc = NOTE[m[1]], q = m[2] || "";
        const iv = q === "m7" ? [0, 3, 7, 10] : q === "m" ? [0, 3, 7] : q === "dim" ? [0, 3, 6] : q === "dim7" ? [0, 3, 6, 9] : q === "sus" ? [0, 5, 7] : q === "maj7" ? [0, 4, 7, 11] : q === "7" ? [0, 4, 7, 10] : [0, 4, 7];
        const tones = iv.map(i => { let n = 60 + pc + i; while (n > 71) n -= 12; return n; }).sort((a, b) => a - b);
        return (chordCache[name] = { root: 36 + pc, tones, top: q === "maj7" ? 11 : q.startsWith("dim") ? 9 : 10 });
    }
    // "Ab Bb": a chord a half-bar.
    function chordAt(name, s) {
        const parts = name.split(" ");
        return chordOf(parts[s < 8 ? 0 : parts.length - 1]);
    }

    // ---- sound
    let ctx = null, master = null, shade = null, lowpass = null, noise = null;
    // (17 Oct 2026) the haunting: the cavern's send, the dry path and its dulling, the ghost's own bus, and how haunted it is
    let hauntSend = null, hauntDry = null, hauntLP = null, ghostBus = null, hauntLevel = 0;
    /* (17 Oct 2026) the tune's own bus, so it can be turned down without the sound effects: while the tune is
       being booked (book), every voice goes to dest (musicBus) rather than straight to the master */
    let musicBus = null, dest = null;
    /* BASS HEAVY (21 Oct 2026, the owner's: "Make some more bass heavy versions of the splash screen soundtrack and
       zone 1 soundtrack"). Two, picked in the editor's jukebox only (start(..., { heavy })); the game plays the tunes
       as they were. heavy 1, HEAVY: a longer, deeper kick, a sine sub an octave under every bass note, the lows
       shelved up and the low mids eased off to make room. heavy 2, DEEP: an 808's way, long sub notes on the
       chord's root an octave down, gliding from one to the next, locked to the kick, a big round kick, the rest of
       the tune pumping out of their way on every kick, and warmed (saturated) so the sub is heard on small speakers
       too; the old bass line kept, quieter, for its pluck. The kick and the subs go round the pumping (kickBus). */
    let heavy = 0, heavyEQ = null, heavyMid = null, heavyDry = null, heavyWet = null, duck = null, kickBus = null, kickDry = null, kickWet = null, last808 = 0;
    // how far the tune is stripped back for the dark (0 to 1, following the haunting), and whether the ghost has the lead
    let strip = 0, stripLead = false, stripOn = false;
    let wetBus = null, delay = null, feedback = null;
    let muted = false, muffled = false, sad = false;
    const SAD_HZ = 2200, DARK_HZ = 2600, UNDER_HZ = 420;
    const MUFFLED_HZ = 700, OPEN_HZ = 20000;
    const loudness = () => (muted ? 0 : muffled ? VOLUME * 0.5 : titleOnly ? VOLUME * 0.8 : VOLUME);
    try { muted = localStorage.getItem(STORE) === "off"; } catch (e) { /* private mode: on */ }

    /* master → shade (the zone's colour: Dark dulls the top) → lowpass (the
       muffle, and the splash's moment under water) → limiter → speakers.
       The echo: voices that want it also feed wetBus → delay → damp (a
       low-pass) → back into master, and round again through feedback. */
    function setup() {
        if (ctx) return true;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = loudness();
            shade = ctx.createBiquadFilter();
            shade.type = "lowpass";
            shade.Q.value = 0.7;
            shade.frequency.value = zoneOf(zone) === 4 ? DARK_HZ : OPEN_HZ;
            lowpass = ctx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.Q.value = 0.7;
            lowpass.frequency.value = muffled ? MUFFLED_HZ : OPEN_HZ;
            /* THE HAUNTING (17 Oct 2026, the owner's: "a haunting ghostly echo when in the dark areas"): the dry
               sound through a filter that dulls it and a level that draws it back, and beside it a send into a
               cavern (a long made reverb, and an echo going round), both following haunt(0 to 1). Nothing
               changes while it is 0. */
            musicBus = ctx.createGain();
            {   // the bass-heavy chain (all flat, nothing changed, while heavy is 0)
                const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
                heavyEQ = ctx.createBiquadFilter(); heavyEQ.type = "lowshelf"; heavyEQ.frequency.value = 100; heavyEQ.gain.value = 0;
                heavyMid = ctx.createBiquadFilter(); heavyMid.type = "peaking"; heavyMid.frequency.value = 420; heavyMid.Q.value = 0.9; heavyMid.gain.value = 0;
                const sh = ctx.createWaveShaper(); sh.curve = curve;
                heavyDry = ctx.createGain(); heavyWet = ctx.createGain(); heavyWet.gain.value = 0; duck = ctx.createGain();
                musicBus.connect(heavyEQ); heavyEQ.connect(heavyMid); heavyMid.connect(heavyDry); heavyDry.connect(duck); heavyMid.connect(sh); sh.connect(heavyWet); heavyWet.connect(duck); duck.connect(master);
                const ksh = ctx.createWaveShaper(); ksh.curve = curve;
                kickBus = ctx.createGain(); kickDry = ctx.createGain(); kickWet = ctx.createGain(); kickWet.gain.value = 0;
                kickBus.connect(kickDry); kickDry.connect(master); kickBus.connect(ksh); ksh.connect(kickWet); kickWet.connect(master);
            }
            hauntDry = ctx.createGain(); hauntLP = ctx.createBiquadFilter(); hauntLP.type = "lowpass"; hauntLP.frequency.value = OPEN_HZ; hauntLP.Q.value = 0.5;
            master.connect(hauntDry); hauntDry.connect(hauntLP); hauntLP.connect(shade);
            const cave = ctx.createConvolver(), caveOut = ctx.createGain();
            {   // the cavern: stereo noise dying over four seconds, its top dulled as it goes
                const n = Math.floor(ctx.sampleRate * 4), b = ctx.createBuffer(2, n, ctx.sampleRate);
                for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.85 - 0.75 * t); d[i] = lp * Math.pow(1 - t, 2.4) * Math.min(1, i / (ctx.sampleRate * 0.02)); } }
                cave.buffer = b;
            }
            caveOut.gain.value = 0.7; cave.connect(caveOut); caveOut.connect(shade);
            hauntSend = ctx.createGain(); hauntSend.gain.value = 0; master.connect(hauntSend); hauntSend.connect(cave);
            {   // and an echo going round, slow and dark
                const d = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), out = ctx.createGain();
                d.delayTime.value = 0.43; fb.gain.value = 0.45; lp.type = "lowpass"; lp.frequency.value = 1500; out.gain.value = 0.5;
                hauntSend.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out); out.connect(shade);
            }
            /* THE GHOST's bus: the epic Mine's lead (rat-race-epic.js), into the master, into the cavern whatever
               the haunting, and its echoes thrown left and right */
            ghostBus = ctx.createGain(); ghostBus.connect(master);
            const gCave = ctx.createGain(); gCave.gain.value = 0.55; ghostBus.connect(gCave); gCave.connect(cave);
            {
                const dL = ctx.createDelay(1), dR = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), into = ctx.createGain();
                const pan = (v) => { if (typeof ctx.createStereoPanner !== "function") return ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
                const pL = pan(-0.85), pR = pan(0.85);
                dL.delayTime.value = 0.36; dR.delayTime.value = 0.36; fb.gain.value = 0.32; lp.type = "lowpass"; lp.frequency.value = 2200; into.gain.value = 0.35;
                ghostBus.connect(into); into.connect(lp); lp.connect(dL); dL.connect(pL); dL.connect(dR); dR.connect(pR); dR.connect(fb); fb.connect(lp);
                pL.connect(master); pR.connect(master);
            }
            shade.connect(lowpass);
            /* A limiter last (11 Oct 2026): kick, bass and snare landing on
               the same step peaked hot enough to clip. It only ever turns the
               loudest moments down. Missing in a browser without one: then
               straight out, as before. */
            let out = lowpass;
            if (typeof ctx.createDynamicsCompressor === "function") {
                const limit = ctx.createDynamicsCompressor();
                limit.threshold.value = -10;
                limit.knee.value = 6;
                limit.ratio.value = 8;
                limit.attack.value = 0.003;
                limit.release.value = 0.15;
                lowpass.connect(limit);
                out = limit;
            }
            out.connect(ctx.destination);
            wetBus = ctx.createGain();
            wetBus.gain.value = 0.35;
            delay = ctx.createDelay(1);
            delay.delayTime.value = Math.min(0.95, 3 * stepLen());
            const damp = ctx.createBiquadFilter();
            damp.type = "lowpass";
            damp.frequency.value = 2200;
            feedback = ctx.createGain();
            feedback.gain.value = 0.35;
            wetBus.connect(delay);
            delay.connect(damp);
            damp.connect(musicBus);
            damp.connect(feedback);
            feedback.connect(delay);
            const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            noise = buf;
            return true;
        } catch (e) {
            ctx = null;
            return false;
        }
    }

    /* One FM note (see THE STYLE). p:
         vol         loudness
         ratio       modulator : carrier frequency
         index       how hard the modulator wobbles at the start (×freq Hz),
         indexTo     …and where it ends up, after indexTime seconds
         attack      seconds to full volume
         ring        struck: dies away over the whole note (bells)
         sustain     otherwise the level it settles to (fraction of vol),
         decay       …that fast (a time constant)
         release     …and how fast it is cut off at the end (a time
                     constant; small = gated, punchy)
         from        a pitch to start at and drop onto the note within 15ms
         to          a pitch to glide to over the note
         cents       detune (for an ensemble of two)
         cut         a low-pass of the note's own (Hz): rounds the top off
         vib         vibrato depth (a fraction of the pitch), easing in
                     after a quarter of a second, as a player leans on a
                     long note
         wet         also feed the echo */
    function fm(at, dur, freq, p) {
        const ratio = p.ratio || 1;
        if (p.cents) freq *= Math.pow(2, p.cents / 1200);
        const c = ctx.createOscillator();
        c.type = "sine";
        const m = ctx.createOscillator();
        m.type = "sine";
        if (p.from) {
            c.frequency.setValueAtTime(p.from, at);
            c.frequency.exponentialRampToValueAtTime(freq, at + 0.015);
        } else c.frequency.setValueAtTime(freq, at);
        m.frequency.setValueAtTime(freq * ratio, at);
        if (p.to) {
            c.frequency.exponentialRampToValueAtTime(p.to, at + dur);
            m.frequency.exponentialRampToValueAtTime(p.to * ratio, at + dur);
        }
        const index = p.index || 1;
        const indexTo = p.indexTo == null ? index : p.indexTo;
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(index * freq, at);
        mg.gain.exponentialRampToValueAtTime(Math.max(0.01, indexTo) * freq, at + (p.indexTime || dur));
        m.connect(mg); mg.connect(c.frequency);
        const g = ctx.createGain();
        const a = p.attack || 0.004;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(p.vol, at + a);
        let end = at + dur;
        if (p.ring) {
            g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        } else {
            const rel = p.release || 0.02;
            g.gain.setTargetAtTime(p.vol * (p.sustain == null ? 0.6 : p.sustain), at + a, p.decay || 0.08);
            g.gain.setTargetAtTime(0, at + dur, rel);
            end += rel * 5;
        }
        let out = g;
        if (p.cut) {
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = p.cut;
            lp.Q.value = 0.5;
            g.connect(lp);
            out = lp;
        }
        if (p.vib && dur > 0.3) {
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 5.2;
            const depth = ctx.createGain();
            depth.gain.setValueAtTime(0, at);
            depth.gain.setValueAtTime(0, at + 0.22);
            depth.gain.linearRampToValueAtTime(freq * p.vib, at + 0.5);
            lfo.connect(depth); depth.connect(c.frequency);
            lfo.start(at); lfo.stop(end + 0.02);
        }
        c.connect(g); out.connect(dest || master);
        if (p.wet) out.connect(wetBus);
        c.start(at); m.start(at);
        c.stop(end + 0.02); m.stop(end + 0.02);
    }

    // The voices. Bass and stabs gated (cut off in ~8ms) for the punch.
    const bass = (at, dur, f, gritty, vol) => { fm(at, dur, f, { vol: vol || 0.6, ratio: 1, index: gritty ? 8 : 5, indexTo: gritty ? 1.4 : 0.6, indexTime: 0.09, from: f * 1.2, sustain: 0.7, decay: 0.15, release: 0.008 }); if (heavy === 1) subUnder(at, dur, f, 0.42 * (vol || 0.6) / 0.6); };
    const mutedBass = (at, f, gritty, scale) => { fm(at, 0.12, f, { vol: 0.55 * (scale || 1), ratio: 1, index: gritty ? 3 : 1.5, indexTo: 0.3, indexTime: 0.06, sustain: 0.5, decay: 0.05, release: 0.01 }); if (heavy === 1) subUnder(at, 0.2, f, 0.4 * (scale || 1)); };
    // (heavy) a sine an octave under a bass note, rounding off with it
    function subUnder(at, dur, f, vol) {
        const o = ctx.createOscillator(), g = ctx.createGain(), d = Math.max(0.16, dur * 1.2), hold = Math.min(d * 0.5, 0.12);
        o.type = "sine"; o.frequency.setValueAtTime(f / 2, at);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.006); g.gain.setValueAtTime(vol, at + hold); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(g); g.connect(kickBus || dest || master); o.start(at); o.stop(at + d + 0.02);
    }
    // (deep) an 808: a long sine on the root, a little pitch drop at its start, gliding over from the last one
    function sub808(at, dur, f, vol) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        if (last808 && Math.abs(last808 - f) > 0.5) { o.frequency.setValueAtTime(last808, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.07); }
        else { o.frequency.setValueAtTime(f * 1.5, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.03); }
        last808 = f;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.005); g.gain.setTargetAtTime(vol * 0.55, at + 0.05, dur * 0.35); g.gain.setTargetAtTime(0.0001, at + dur, 0.05);
        o.connect(g); g.connect(kickBus); o.start(at); o.stop(at + dur + 0.35);
    }
    function setHeavy(n, t) {
        heavy = n; last808 = 0;
        if (!heavyEQ) return;
        const P = n === 1 ? { shelf: 5.5, sf: 105, mid: -2.5, dry: 1, wet: 0.12, kd: 0.85, kw: 0.25 } : n === 2 ? { shelf: 4, sf: 85, mid: -3.5, dry: 0.78, wet: 0.38, kd: 0.7, kw: 0.55 } : { shelf: 0, sf: 100, mid: 0, dry: 1, wet: 0, kd: 1, kw: 0 };
        heavyEQ.gain.setValueAtTime(P.shelf, t); heavyEQ.frequency.setValueAtTime(P.sf, t); heavyMid.gain.setValueAtTime(P.mid, t);
        heavyDry.gain.setValueAtTime(P.dry, t); heavyWet.gain.setValueAtTime(P.wet, t); kickDry.gain.setValueAtTime(P.kd, t); kickWet.gain.setValueAtTime(P.kw, t);
        duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(1, t);
    }
    const deadNote = (at, f) => fm(at, 0.035, f, { vol: 0.3, ratio: 1, index: 9, indexTo: 2, indexTime: 0.03, sustain: 0.3, decay: 0.01, release: 0.005 });
    const brass = (at, dur, f, vol) => fm(at, dur, f, { vol: vol || 0.17, ratio: 1, index: 1.5, indexTo: 3, indexTime: 0.12, attack: 0.012, sustain: 0.75, decay: 0.2, release: 0.03, wet: true });
    const stab = (at, f, vol) => fm(at, 0.08, f, { vol: vol || 0.08, ratio: 1, index: 3.2, indexTo: 1.4, indexTime: 0.06, attack: 0.005, sustain: 0.8, decay: 0.1, release: 0.008 });
    const bell = (at, dur, f, vol) => fm(at, dur, f, { vol: vol || 0.13, ratio: 3.5, index: 2.5, indexTo: 0.2, indexTime: Math.min(0.25, dur), ring: true, wet: true });
    /* THE MINE LABYRINTH'S OWN (once the Wood's) (13 Oct 2026: the brass hook was "squealy";
       the owner wanted it "less squealy and more adventure"). A HORN
       SECTION for the hook: two horns a few cents apart (the width of
       players, not a chip), the FM kept gentle (the index swells only to
       1.4, where the old brass went to 3), rounded off at 1.9kHz, a breath
       of attack, vibrato on the long notes, and a quiet horn an octave
       under for body; played an octave lower than the old brass, in the
       horns' own range. A MARIMBA for the mystery motif and the answers in
       place of the glassy bells: wood struck, a knock (ratio 4, gone in
       50ms) on a round body that rings half a second. */
    function horn(at, dur, f, vol) {
        const p = { ratio: 1, index: 0.5, indexTo: 1.4, indexTime: 0.16, attack: 0.035, sustain: 0.85, decay: 0.3, release: 0.07, cut: 1900, vib: 0.006, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.55, cents: -6 }));
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: 6, vib: 0.005 }));
        fm(at, dur, f / 2, { vol: vol * 0.3, ratio: 1, index: 0.3, indexTo: 0.8, indexTime: 0.2, attack: 0.05, sustain: 0.8, decay: 0.3, release: 0.08, cut: 900 });
    }
    function marimba(at, dur, f, vol) {
        fm(at, Math.min(0.55, Math.max(0.3, dur)), f, { vol, ratio: 1, index: 0.6, indexTo: 0.02, indexTime: 0.12, ring: true, wet: true });
        fm(at, 0.08, f, { vol: vol * 0.45, ratio: 4, index: 1.6, indexTo: 0.05, indexTime: 0.05, ring: true });
    }
    /* THE MINE'S HARMONIES (21 Oct 2026, the owner's: "improve the lead and give it some harmonies underneath it;
       at the moment it just feels a little bit empty"). Under the hook a second horn, the chord's own note a third
       to a sixth below each of the tune's (so it moves with it, in the chord), and a bowed string in unison with
       the horns on the long notes to carry them; under the marimba's motif a second marimba in thirds; and under
       it all a soft warm pad on the chord, held through each bar (each half-bar chord its own), quiet in the
       mystery, fuller under the hook, swelling through the build. Not on the title (the same tune, kept as it is). */
    function harmonyBelow(n, chord) {
        let best = null;
        for (const t of chord.tones) for (let k = -3; k <= 1; k++) { const c = t + 12 * k, d = n - c; if (d >= 3 && d <= 9 && (best === null || c > best)) best = c; }
        return best === null ? n - 8 : best;
    }
    function warmPad(at, dur, f, vol) {
        const p = { ratio: 1, index: 0.35, indexTo: 0.12, indexTime: Math.max(0.3, dur * 0.5), attack: Math.min(0.35, dur * 0.25), sustain: 0.9, decay: 0.4, release: 0.3, cut: 1500, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.55, cents: -5 }));
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: 5, vib: 0.003 }));
    }
    const bowed = (at, dur, f, vol) => fm(at, dur, f, { vol, ratio: 1, index: 0.9, indexTo: 1.3, indexTime: 0.3, attack: 0.09, sustain: 0.85, decay: 0.3, release: 0.12, cut: 2600, vib: 0.007, wet: true });
    // Stabs in the Wood: the same chord, rounder.
    const hornStab = (at, f, vol) => fm(at, 0.09, f, { vol: vol || 0.08, ratio: 1, index: 1.8, indexTo: 0.8, indexTime: 0.06, attack: 0.008, sustain: 0.8, decay: 0.1, release: 0.012, cut: 2400 });

    /* THE ZONES' VOICES (13 Oct 2026).
       anvil    the Quarry's motif: metal struck, an inharmonic ring (ratio
                2.76) gone in a third of a second, a hard click on the front
       clav     the Quarry's hook: a plucked clavinet, bright and quick to
                fall, two a few cents apart, a brass note under it for body
       celesta  Ice's motif: a struck glass bell, ratio 4, ringing long
       flute    Ice's hook: nearly a sine, a breath of noise on each note,
                slow attack and vibrato
       ocarina  the Dark's hook: round and hollow, rounded off at 1.8kHz, a
                slow vibrato; the choir under it a soft pad of two sines
       sonar    the Station's motif: a pure ping with a long tail, echoing
       synth    the Station's hook: two bright saws' worth of FM, detuned,
                held                                                        */
    function anvil(at, dur, f, vol) {
        fm(at, 0.34, f, { vol, ratio: 2.76, index: 3.5, indexTo: 0.2, indexTime: 0.18, ring: true, wet: true });
        fm(at, 0.03, f * 2, { vol: vol * 0.5, ratio: 5.1, index: 4, indexTo: 1, indexTime: 0.02, ring: true });
    }
    function clav(at, dur, f, vol) {
        const p = { ratio: 1, index: 3.4, indexTo: 1.1, indexTime: 0.07, attack: 0.004, sustain: 0.45, decay: 0.09, release: 0.025, cut: 3400, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.55, cents: -5 }));
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.45, cents: 5 }));
        brass(at, dur, f / 2, vol * 0.35);
    }
    /* THE QUARRY'S NEW BAND (14 Oct 2026, the owner's: "the soundtrack for the
       quarry is too similar to the mine labyrinth soundtrack, so completely
       rework it"). Out in the sun now: a shuffle, not a drive.
         banjo      the motif and the answers: a bright pluck with a twang,
                    a quick fall, a metallic edge (ratio 3 under it)
         harmonica  the hook: reedy, two reeds a few cents apart, a breath
                    on the front, vibrato on the long notes
         fiddle     the counter-line: bowed, slow to speak, wide vibrato
         tuba       the bass: round and soft, oom (root) and pah (fifth)
         honky      the off-beat "chick": an old upright, two strings out of tune
         clink      a hammer on a chisel, once a bar: the quarry at work */
    function banjo(at, dur, f, vol) {
        fm(at, 0.32, f, { vol, ratio: 1, index: 3.2, indexTo: 0.25, indexTime: 0.06, attack: 0.002, sustain: 0.18, decay: 0.09, release: 0.06, cut: 5200, wet: true });
        fm(at, 0.12, f, { vol: vol * 0.35, ratio: 3, index: 2, indexTo: 0.1, indexTime: 0.04, ring: true });
    }
    function harmonica(at, dur, f, vol) {
        const p = { ratio: 1, index: 1.7, indexTo: 1.2, indexTime: 0.1, attack: 0.03, sustain: 0.8, decay: 0.2, release: 0.06, cut: 2700, vib: 0.011, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: -8 }));
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.45, cents: 8, ratio: 2, index: 0.6, indexTo: 0.4 }));
        hiss(at, 0.05, vol * 0.18, 2600, "bandpass", 3);
    }
    const fiddle = (at, dur, f, vol) => fm(at, dur, f, { vol: vol * 0.8, ratio: 1, index: 1.1, indexTo: 1.8, indexTime: 0.4, attack: 0.12, sustain: 0.85, decay: 0.4, release: 0.15, cut: 3000, vib: 0.016, wet: true });
    const tuba = (at, dur, f, vol) => fm(at, dur, f, { vol: vol || 0.5, ratio: 1, index: 0.9, indexTo: 0.4, indexTime: 0.12, attack: 0.02, sustain: 0.7, decay: 0.12, release: 0.04, cut: 900 });
    function honky(at, f, vol) {
        fm(at, 0.11, f, { vol: (vol || 0.08) * 0.6, ratio: 1, index: 1.6, indexTo: 0.4, indexTime: 0.08, attack: 0.003, sustain: 0.4, decay: 0.07, release: 0.02, cut: 3000, cents: -12 });
        fm(at, 0.11, f, { vol: (vol || 0.08) * 0.5, ratio: 1, index: 1.6, indexTo: 0.4, indexTime: 0.08, attack: 0.003, sustain: 0.4, decay: 0.07, release: 0.02, cut: 3000, cents: 12 });
    }
    /* THE QUARRY, THIRD TIME (14 Oct 2026).
         pipe    the motif: a length of steel pipe struck, a clang with a short ring
         organ   the hook: two drawbars and some drive, bright and cutting
         clank   the backbeat: metal on metal, with a hiss of steam behind it */
    function pipe(at, dur, f, vol) {
        fm(at, 0.45, f, { vol, ratio: 2.4, index: 1.7, indexTo: 0.1, indexTime: 0.14, ring: true, wet: true });
        fm(at, 0.03, f * 3, { vol: vol * 0.4, ratio: 1.5, index: 3, indexTo: 0.5, indexTime: 0.02, ring: true });
    }
    function organ(at, dur, f, vol) {
        const p = { ratio: 1, index: 1.1, indexTo: 1.5, indexTime: 0.06, attack: 0.006, sustain: 0.9, decay: 0.1, release: 0.04, cut: 3400, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.55, cents: -4 }));
        fm(at, dur, f * 2, Object.assign({}, p, { vol: vol * 0.22, cents: 4, index: 0.6 }));
        fm(at, dur, f / 2, Object.assign({}, p, { vol: vol * 0.25, index: 0.4, cut: 1200 }));
    }
    const clank = (at, vol) => { fm(at, 0.16, 640, { vol: (vol || 0.1) * 0.7, ratio: 2.76, index: 3, indexTo: 0.2, indexTime: 0.06, ring: true }); hiss(at, 0.07, (vol || 0.1) * 2.4, 2600, "bandpass", 1.1); drop(at, 0.06, 240, 120, (vol || 0.1) * 2); };
    const clink = (at, vol) => { fm(at, 0.5, 2093, { vol: vol || 0.05, ratio: 2.76, index: 1.4, indexTo: 0.05, indexTime: 0.12, ring: true, wet: true }); hiss(at, 0.02, (vol || 0.05) * 1.5, 6000); };
    /* THE NEW ZONES' VOICES (14 Oct 2026).
         musicbox  the Vault's motif: a comb plucked, bright and short, a tine over it
         clarinet  the Vault's hook: odd harmonics (the modulator an octave up), woody
         block     the Vault's tick and tock: a woodblock, high on the beat, low between
         oud       the Tomb's motif: a fretless pluck that slides up into its note
         ney       the Tomb's hook: a reed flute, all breath, wide slow vibrato
         dum, tek  the Tomb's darbuka: the deep middle and the sharp rim
         forge     the Foundry's hook: brass with a hot edge
         pan       the Ruins' hook: a steel pan, struck metal ringing
         bongo     the Ruins' drums, high and low */
    function musicbox(at, dur, f, vol) {
        fm(at, 0.7, f, { vol, ratio: 4, index: 0.9, indexTo: 0.05, indexTime: 0.2, ring: true, wet: true });
        fm(at, 0.25, f * 2, { vol: vol * 0.25, ratio: 7, index: 0.6, indexTo: 0.02, indexTime: 0.1, ring: true });
    }
    const clarinet = (at, dur, f, vol) => fm(at, dur, f, { vol: vol * 0.9, ratio: 2, index: 1.3, indexTo: 0.8, indexTime: 0.15, attack: 0.03, sustain: 0.85, decay: 0.25, release: 0.06, cut: 3200, vib: 0.008, wet: true });
    const block = (at, hi, vol) => { fm(at, 0.06, hi ? 1250 : 880, { vol: vol || 0.12, ratio: 1.5, index: 0.8, indexTo: 0.05, indexTime: 0.03, ring: true }); hiss(at, 0.015, (vol || 0.12) * 0.6, 3000, "bandpass", 2); };
    function oud(at, dur, f, vol) {
        fm(at, 0.45, f, { vol, ratio: 1, index: 2.4, indexTo: 0.3, indexTime: 0.12, attack: 0.003, sustain: 0.25, decay: 0.14, release: 0.06, from: f * 0.96, cut: 3600, wet: true });
        fm(at, 0.1, f * 2, { vol: vol * 0.3, ratio: 3, index: 1.5, indexTo: 0.1, indexTime: 0.05, ring: true });
    }
    function ney(at, dur, f, vol) {
        fm(at, dur, f, { vol: vol * 0.85, ratio: 1, index: 0.2, indexTo: 0.45, indexTime: 0.3, attack: 0.08, sustain: 0.85, decay: 0.4, release: 0.1, vib: 0.016, cut: 3800, wet: true });
        hiss(at, Math.min(0.4, dur), vol * 0.3, 2400, "bandpass", 1.5);
    }
    const dum = (at, vol) => drop(at, 0.3, 120, 68, 0.9 * (vol || 1), 0.12);
    const tek = (at, vol) => { hiss(at, 0.05, 0.35 * (vol || 1), 3800, "bandpass", 1.4); drop(at, 0.04, 520, 380, 0.18 * (vol || 1)); };
    function forge(at, dur, f, vol) {
        const p = { ratio: 1, index: 2.4, indexTo: 3.8, indexTime: 0.1, attack: 0.008, sustain: 0.8, decay: 0.18, release: 0.03, cut: 2700, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: -10 }));
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.45, cents: 10 }));
    }
    function pan(at, dur, f, vol) {
        fm(at, Math.max(0.5, dur), f, { vol, ratio: 2, index: 1.3, indexTo: 0.1, indexTime: 0.25, ring: true, wet: true });
        fm(at, 0.3, f * 3, { vol: vol * 0.18, ratio: 1, index: 0.3, ring: true });
    }
    const bongo = (at, hi, vol) => drop(at, 0.11, hi ? 420 : 280, hi ? 330 : 220, (vol || 0.4) * (hi ? 0.8 : 1), 0.05);
    const celesta = (at, dur, f, vol) => fm(at, Math.max(0.6, dur), f, { vol, ratio: 4, index: 1.3, indexTo: 0.08, indexTime: 0.3, ring: true, wet: true });
    function flute(at, dur, f, vol) {
        fm(at, dur, f, { vol: vol * 0.9, ratio: 1, index: 0.25, indexTo: 0.5, indexTime: 0.2, attack: 0.05, sustain: 0.85, decay: 0.3, release: 0.08, vib: 0.009, cut: 4200, wet: true });
        hiss(at, 0.06, vol * 0.25, 3000, "bandpass", 2);
    }
    const ocarina = (at, dur, f, vol) => fm(at, dur, f, { vol: vol * 0.95, ratio: 1, index: 0.4, indexTo: 0.6, indexTime: 0.25, attack: 0.06, sustain: 0.85, decay: 0.3, release: 0.1, vib: 0.012, cut: 1800, wet: true });
    function choir(at, dur, f, vol) {
        fm(at, dur, f, { vol: vol * 0.6, ratio: 1, index: 0.2, indexTo: 0.3, attack: 0.25, sustain: 0.9, decay: 0.5, release: 0.3, cents: -7, wet: true });
        fm(at, dur, f * 2, { vol: vol * 0.3, ratio: 1, index: 0.2, attack: 0.3, sustain: 0.9, decay: 0.5, release: 0.3, cents: 7, wet: true });
    }
    const sonar = (at, dur, f, vol) => fm(at, 0.9, f, { vol: vol * 0.9, ratio: 1, index: 0.25, indexTo: 0.02, indexTime: 0.3, ring: true, wet: true });
    function synth(at, dur, f, vol) {
        const p = { ratio: 1, index: 2.6, indexTo: 2, indexTime: 0.2, attack: 0.01, sustain: 0.8, decay: 0.15, release: 0.04, cut: 3800, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: -9 }));
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.45, cents: 9 }));
    }
    const softStab = (at, f, vol) => fm(at, 0.12, f, { vol: (vol || 0.08) * 0.8, ratio: 1, index: 0.8, indexTo: 0.3, indexTime: 0.1, attack: 0.01, sustain: 0.6, decay: 0.1, release: 0.03, cut: 2200 });
    const synthStab = (at, f, vol) => fm(at, 0.08, f, { vol: vol || 0.08, ratio: 2, index: 2, indexTo: 1, indexTime: 0.06, attack: 0.004, sustain: 0.8, decay: 0.1, release: 0.01, cut: 3200 });
    /* THE NEON VOICES (23 Oct 2026, the owner's: "Completely rework the Neon Jungle Arcade soundtrack, give it neo
       tokyo / synthwave vibes"). Not FM like the rest: an analogue synth's way, real sawtooth and square oscillators
       a few cents apart, through a resonant low-pass whose cutoff sweeps (cut0 to cut, then settling at cutS), an
       amp envelope, a slow vibrato on long notes, into the echo.
         ana(at, dur, f, p): p.waves [type, cents, gain] each; vol; attack, decay, sustain, release; cut0, cut, cutS,
         cutT (the sweep's time), q; vib; wet */
    function ana(at, dur, f, p) {
        const out = ctx.createGain(), lp = ctx.createBiquadFilter(), a = p.attack || 0.005, rel = p.release || 0.05, end = at + dur + rel * 5;
        lp.type = "lowpass"; lp.Q.value = p.q || 1;
        lp.frequency.setValueAtTime(p.cut0 || p.cut || 2000, at);
        if (p.cut0) lp.frequency.exponentialRampToValueAtTime(p.cut, at + (p.cutT || 0.05));
        if (p.cutS) lp.frequency.setTargetAtTime(p.cutS, at + (p.cutT || 0.05), p.decay || 0.2);
        out.gain.setValueAtTime(0, at);
        out.gain.linearRampToValueAtTime(p.vol, at + a);
        out.gain.setTargetAtTime(p.vol * (p.sustain == null ? 0.7 : p.sustain), at + a, p.decay || 0.15);
        out.gain.setTargetAtTime(0, at + dur, rel);
        for (const [type, cents, gain] of p.waves) {
            const o = ctx.createOscillator(), og = ctx.createGain();
            o.type = type; o.frequency.setValueAtTime(f, at); o.detune.setValueAtTime(cents || 0, at);
            if (p.vib && dur > 0.35) { const lfo = ctx.createOscillator(), d = ctx.createGain(); lfo.frequency.value = 5.4; d.gain.setValueAtTime(0, at); d.gain.setValueAtTime(0, at + 0.3); d.gain.linearRampToValueAtTime(p.vib, at + 0.6); lfo.connect(d); d.connect(o.detune); lfo.start(at); lfo.stop(end); }
            og.gain.value = gain == null ? 1 : gain; o.connect(og); og.connect(lp); o.start(at); o.stop(end);
        }
        lp.connect(out); out.connect(dest || master);
        if (p.wet) out.connect(wetBus);
    }
    // the lead: a supersaw, three saws spread wide and a square an octave down for weight; its filter opening as it speaks
    const sawLead = (at, dur, f, vol) => ana(at, dur, f, { vol: vol * 0.32, waves: [["sawtooth", -14, 0.55], ["sawtooth", 0, 0.6], ["sawtooth", 13, 0.55], ["square", -1200, 0.25]], attack: 0.012, decay: 0.25, sustain: 0.8, release: 0.08, cut0: 900, cut: 4200, cutS: 2800, cutT: 0.06, q: 2.2, vib: 14, wet: true });
    // the motif: a DX7's electric piano, a tine struck and the bell in it ringing over the top, as the eighties had it
    const dxKeys = (at, dur, f, vol) => { fm(at, Math.max(0.6, dur * 1.4), f, { vol: vol * 0.75, ratio: 1, index: 1.6, indexTo: 0.15, indexTime: 0.35, ring: true, wet: true }); fm(at, 0.35, f, { vol: vol * 0.18, ratio: 14, index: 0.9, indexTo: 0.05, indexTime: 0.12, ring: true }); fm(at, Math.max(0.6, dur * 1.4), f, { vol: vol * 0.35, ratio: 1, index: 1.2, indexTo: 0.1, indexTime: 0.4, ring: true, cents: 7 }); };
    // the arpeggio: a short plucked square, its filter snapping shut
    const arpPluck = (at, f, vol) => ana(at, 0.11, f, { vol, waves: [["square", -6, 0.6], ["sawtooth", 6, 0.5]], attack: 0.003, decay: 0.06, sustain: 0.3, release: 0.04, cut0: 4500, cut: 700, cutT: 0.12, q: 4, wet: true });
    // the pad: wide detuned saws, slow in, filtered warm, a long tail into the echo
    const neonPad = (at, dur, f, vol) => ana(at, dur, f, { vol: vol * 0.55, waves: [["sawtooth", -9, 0.5], ["sawtooth", 9, 0.5], ["triangle", 1200, 0.3]], attack: Math.min(0.6, dur * 0.3), decay: 0.6, sustain: 0.85, release: 0.45, cut: 1300, q: 0.8, vib: 6, wet: true });
    // the bass: saw and square on a low-pass that bites on each note (the octaves pulsing in eighths)
    const synthBass = (at, dur, f, vol) => ana(at, dur, f, { vol: vol * 0.5, waves: [["sawtooth", 0, 0.7], ["square", -1200, 0.5]], attack: 0.004, decay: 0.09, sustain: 0.55, release: 0.03, cut0: 1600, cut: 380, cutT: 0.1, q: 3 });
    const neonStab = (at, f, vol) => ana(at, 0.1, f, { vol: (vol || 0.08) * 0.9, waves: [["sawtooth", -10, 0.5], ["sawtooth", 10, 0.5]], attack: 0.004, decay: 0.07, sustain: 0.5, release: 0.03, cut0: 3500, cut: 1200, cutT: 0.08, q: 2, wet: true });
    // the eighties' snare: the crack, and a burst of room behind it held then cut dead (gated reverb)
    function gatedSnare(at, vol) {
        if (!MIX.snare) return;
        snare(at, vol * 0.85);
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noise; f.type = "bandpass"; f.frequency.value = 1700; f.Q.value = 0.55;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.22 * vol, at + 0.008); g.gain.setValueAtTime(0.17 * vol, at + 0.16); g.gain.linearRampToValueAtTime(0, at + 0.185);
        s.connect(f); f.connect(g); g.connect(dest || master); g.connect(wetBus);
        s.start(at, Math.random() * 0.5); s.stop(at + 0.2);
    }
    /* THE QUARRY'S FOLK BAND (23 Oct 2026, the owner's: "make a new soundtrack for the quarry that is inspired by the
       Witcher 3 soundtrack"). That score is Slavic dark folk: old instruments of Eastern Europe played by a folk band over
       a cinematic score. Made here from oscillators:
         hurdy     the hurdy-gurdy's tune string: a rosined wheel bowing gut, buzzy and nasal (saws through a resonant
                   low-pass that rings at the top), the wheel's grain catching on each note
         drone     its drone strings, held under each bar: the low D and the A over it, a slow swell in the wheel
         chien     its trompette's buzz, the "dog": the wheel jerked so a bridge rattles, on the beats of the 3+3+2
         gadulka   the bowed folk fiddle over the tune an octave up, each long note flicked into from the note above
         kantele   the plucked zither: the motif and the answers, bright and ringing, the pluck's edge on top
         vocal     the wordless woman's voice: a voice's buzz through three formant bands ("ah"), vibrato after it opens
         lowChoir  the men under it, "oh", held on the chord
         cello     the low strings driving the 3+3+2 on the chord's root
         davul, frame, jingle  the war drum, the frame drum's slap, a tambourine's jingles */
    function hurdy(at, dur, f, vol) {
        ana(at, dur, f, { vol: vol * 0.42, waves: [["sawtooth", -4, 0.6], ["sawtooth", 5, 0.5], ["square", 0, 0.16]], attack: 0.035, decay: 0.3, sustain: 0.85, release: 0.07, cut: 2500, q: 3.4, vib: 8, wet: true });
        ana(at, dur, f * 2, { vol: vol * 0.07, waves: [["sawtooth", 3, 1]], attack: 0.04, decay: 0.3, sustain: 0.8, release: 0.06, cut: 4200, q: 1 });
        hiss(at, Math.min(0.12, dur), vol * 0.1, 2800, "bandpass", 2.2);
    }
    function drone(at, dur, f, fifth, vol) {
        for (const [ff, v] of [[f, 0.5], [fifth, 0.32], [f * 2, 0.16]]) if (ff) ana(at, dur, ff, { vol: vol * v * 0.3, waves: [["sawtooth", -3, 0.6], ["sawtooth", 4, 0.5]], attack: 0.25, decay: 1, sustain: 0.9, release: 0.25, cut: 750, q: 1.4, vib: 3, wet: true });
    }
    function chien(at, f, vol) {
        ana(at, 0.07, f, { vol: vol * 0.6, waves: [["sawtooth", 0, 0.6], ["square", 7, 0.4]], attack: 0.003, decay: 0.03, sustain: 0.3, release: 0.02, cut0: 3800, cut: 1200, cutT: 0.05, q: 4 });
        hiss(at, 0.05, vol * 0.5, 1900, "bandpass", 5);
    }
    function gadulka(at, dur, f, vol) {
        // a flick into the long notes from the note above, a thirtieth of a second, as a folk player ornaments
        const grace = dur > 0.3, g = grace ? 0.035 : 0;
        if (grace) fm(at, g + 0.02, f * 1.1225, { vol: vol * 0.55, ratio: 1, index: 1.4, indexTo: 1.6, indexTime: 0.03, attack: 0.008, sustain: 0.9, decay: 0.05, release: 0.01, cut: 3400 });
        fm(at + g, dur - g, f, { vol: vol * 0.8, ratio: 1, index: 1.2, indexTo: 2.1, indexTime: 0.25, attack: grace ? 0.012 : 0.05, sustain: 0.85, decay: 0.3, release: 0.1, cut: 3400, vib: 0.013, wet: true });
        hiss(at, Math.min(0.1, dur), vol * 0.06, 3500, "bandpass", 3);
    }
    function kantele(at, dur, f, vol) {
        fm(at, Math.max(0.7, dur), f, { vol, ratio: 1, index: 1.8, indexTo: 0.1, indexTime: 0.25, ring: true, wet: true, cut: 4500 });
        fm(at, 0.55, f * 2, { vol: vol * 0.28, ratio: 1, index: 0.8, indexTo: 0.05, indexTime: 0.15, ring: true, cents: 4 });
        fm(at, 0.05, f * 3, { vol: vol * 0.22, ratio: 2, index: 2, indexTo: 0.2, indexTime: 0.03, ring: true });
    }
    function vocal(at, dur, f, vol, vowel) {
        const F = vowel === "o" ? [[420, 1, 7], [780, 0.55, 9], [2600, 0.12, 12]] : [[780, 1, 7], [1180, 0.62, 9], [2850, 0.22, 12]];
        const a = Math.min(0.18, dur * 0.3), rel = 0.22, end = at + dur + rel * 5, out = ctx.createGain(), sum = ctx.createGain();
        out.gain.setValueAtTime(0, at); out.gain.linearRampToValueAtTime(vol, at + a); out.gain.setTargetAtTime(vol * 0.85, at + a, 0.3); out.gain.setTargetAtTime(0, at + dur, rel);
        for (const [ff, g, q] of F) { const bp = ctx.createBiquadFilter(), bg = ctx.createGain(); bp.type = "bandpass"; bp.frequency.value = ff; bp.Q.value = q; bg.gain.value = g * 3.2; sum.connect(bp); bp.connect(bg); bg.connect(out); }
        for (const c of [-6, 6]) {
            const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f, at); o.detune.setValueAtTime(c, at);
            if (dur > 0.35) { const lfo = ctx.createOscillator(), d = ctx.createGain(); lfo.frequency.value = 5.6; d.gain.setValueAtTime(0, at); d.gain.setValueAtTime(0, at + 0.25); d.gain.linearRampToValueAtTime(22, at + 0.6); lfo.connect(d); d.connect(o.detune); lfo.start(at); lfo.stop(end); }
            o.connect(sum); o.start(at); o.stop(end);
        }
        hiss(at, Math.min(0.2, dur), vol * 0.08, 1500, "bandpass", 1);   // her breath
        out.connect(dest || master); out.connect(wetBus);
    }
    const lowChoir = (at, dur, f, vol) => { vocal(at, dur, f, vol * 0.72, "o"); vocal(at, dur, f * 1.0029, vol * 0.52, "o"); };
    const cello = (at, dur, f, vol) => fm(at, dur, f, { vol, ratio: 1, index: 1.4, indexTo: 0.6, indexTime: 0.15, attack: 0.02, sustain: 0.6, decay: 0.2, release: 0.08, cut: 1400 });
    const folkHook = (at, dur, f, vol) => { hurdy(at, dur, f, vol); gadulka(at, dur, f * 2, vol * 0.32); };
    const davul = (at, vol) => { if (!MIX.kick) return; drop(at, 0.5, 92, 46, 1.4 * vol, 0.16); hiss(at, 0.05, 0.28 * vol, 900, "lowpass"); counts.kick++; };
    const frame = (at, vol) => { if (!MIX.snare) return; drop(at, 0.16, 210, 130, 0.7 * vol, 0.05); hiss(at, 0.05, 0.28 * vol, 2100, "bandpass", 1.1); counts.snare++; };
    const jingle = (at, vol) => { if (MIX.hats) hiss(at, 0.09, vol, 7600, "bandpass", 3.5); };
    /* Each zone's band (13 Oct 2026: "the audio should fit each zone
       individually"): what plays the mystery motif, the hook, the answers
       and the stabs, and how far down. The Wood has its own; the other
       zones keep the first band until their turn comes. */
    /* LEAD UP, BASS DOWN (13 Oct 2026, the owner's: "the rule of less bass
       and more lead ... should apply to all soundtracks, or at least
       especially the ice one"): `lead` scales the motif and the hook, `bass`
       the bass line; the Wood, already liked, only a little. Ice's bass
       plays just beats one and three, softly (`sparse`); the Dark's one soft
       note a bar (`toll`). */
    const BANDS = {
        1: { motif: marimba, hook: horn, answer: marimba, stab: hornStab, motifDown: 12, hookDown: 12, answerDown: 12, double: marimba, lead: 1.12, bass: 0.82, harmony: true, pad: true },
        // (23 Oct 2026) the Witcher-like folk band: the kantele's motif, the hurdy-gurdy and fiddle's hook, the men's choir held under,
        // the drones and the cellos for a bass, no stabs; the woman's voice for the breakdown and over the hook the second time round
        2: { motif: kantele, hook: folkHook, answer: kantele, stab: softStab, motifDown: 0, hookDown: 12, answerDown: 0, double: kantele, counter: lowChoir, lead: 1.55, bass: 1.35, hurdy: true, noStabs: true, pad: true, padVoice: lowChoir, vocal },
        // (23 Oct 2026) the Quarry's machine (14 Oct), kept as it was: the jukebox's backup (zone 12)
        12: { motif: pipe, hook: organ, answer: pipe, stab: stab, motifDown: 12, hookDown: 12, answerDown: 0, double: pipe, lead: 1.25, bass: 0.8, gritty: true, pump: true },
        3: { motif: celesta, hook: flute, answer: celesta, stab: softStab, motifDown: 0, hookDown: 12, answerDown: 0, double: celesta, counter: choir, lead: 1.45, bass: 0.5, sparse: true },
        4: { motif: bell, hook: ocarina, answer: bell, stab: softStab, motifDown: 0, hookDown: 0, answerDown: 0, double: bell, counter: choir, lead: 1.3, bass: 1, toll: true },
        5: { motif: sonar, hook: synth, answer: sonar, stab: synthStab, motifDown: 0, hookDown: 12, answerDown: 0, double: sonar, lead: 1.3, bass: 0.62 },
        6: { motif: marimba, hook: horn, answer: marimba, stab: hornStab, motifDown: 12, hookDown: 12, answerDown: 12, double: marimba, lead: 1.25, bass: 0.7 },
        7: { motif: musicbox, hook: clarinet, answer: musicbox, stab: softStab, motifDown: 0, hookDown: 12, answerDown: 0, double: musicbox, counter: clarinet, lead: 1.3, bass: 0.6, sparse: true },
        8: { motif: oud, hook: ney, answer: oud, stab: softStab, motifDown: 12, hookDown: 12, answerDown: 12, double: oud, counter: choir, lead: 1.35, bass: 1, drone: true },
        9: { motif: horn, hook: horn, answer: celesta, stab: hornStab, motifDown: 0, hookDown: 12, answerDown: 0, double: celesta, counter: choir, lead: 1.3, bass: 0.9, drone: true, cellos: true, strings: true },
        // (23 Oct 2026: neo Tokyo, synthwave) the DX7 keys, the supersaw, arpeggios, the saw pad, the bass pumping octaves
        11: { motif: dxKeys, hook: sawLead, answer: dxKeys, stab: neonStab, motifDown: 12, hookDown: 12, answerDown: 12, double: dxKeys, counter: neonPad, lead: 1.2, bass: 0.75, pump: true, bassVoice: synthBass, pad: true, padVoice: neonPad, arp: true },
        10: { motif: marimba, hook: pan, answer: marimba, stab: softStab, motifDown: 12, hookDown: 12, answerDown: 12, double: marimba, lead: 1.3, bass: 0.6, sparse: true }
    };
    const tine = (at, f, vol) => fm(at, 0.22, f, { vol: vol || 0.05, ratio: 14, index: 1, indexTo: 0.05, indexTime: 0.08, ring: true, wet: true });
    // The lament's electric piano: a soft body and a tine on top.
    function piano(at, dur, f, vol) {
        fm(at, dur, f, { vol, ratio: 1, index: 1.5, indexTo: 0.3, indexTime: 0.6, ring: true, wet: true });
        fm(at, Math.min(0.3, dur), f, { vol: vol * 0.25, ratio: 14, index: 0.6, indexTo: 0.02, indexTime: 0.1, ring: true });
    }

    function hiss(at, dur, vol, cut, type, q) {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = type || "highpass";
        f.frequency.value = cut;
        if (q) f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        s.connect(f); f.connect(g); g.connect(dest || master);
        s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.02);
    }

    // A sine falling in pitch and dying: the kick's body, its click, the
    // toms, the throb. `fall` is how much of the note the fall takes.
    function drop(at, dur, from, to, vol, fall) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(from, at);
        o.frequency.exponentialRampToValueAtTime(to, at + (fall || dur * 0.4));
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        o.connect(g); g.connect(dest || master);
        o.start(at); o.stop(at + dur + 0.02);
    }

    // The kick: a short deep thud and a hard click on the front.
    /* THE SECRET MIXER (13 Oct 2026): made to find by ear what the owner
       heard as "short buzzy clicks in rhythm" (it was the rubble), and kept
       because "it's quite a cool secret menu ... for players to find". Each
       layer can be silenced on its own, from the game: 0 shows it, 1 to 8
       silence a layer. Unsaved: a reload brings everything back. */
    const MIX = { kick: true, snare: true, hats: true, bass: true, stabs: true, echo: true, parts: true, lead: true };
    function kick(at, vol) {
        if (!MIX.kick) return;
        vol = vol || 1;
        const keep = dest; if (heavy && kickBus) dest = kickBus;   // (heavy: round the pumping)
        drop(at, 0.2, 160, 40, 1.1 * vol, 0.05);
        drop(at, 0.015, 1400, 220, 0.5 * vol);
        hiss(at, 0.006, 0.6 * vol, 4000);
        if (heavy === 1) drop(at, 0.34, 120, 42, 0.95 * vol, 0.07);   // a longer, deeper thud under it
        if (heavy === 2) {
            drop(at, 0.5, 105, 38, 1.15 * vol, 0.09);                 // the 808's boom
            // the rest of the tune ducking out of its way, and back
            duck.gain.setTargetAtTime(1 - 0.5 * Math.min(1, vol), at, 0.004); duck.gain.setTargetAtTime(1, at + 0.04, 0.1);
        }
        dest = keep;
        counts.kick++;
    }
    // The snare: a bright crack, a short band of noise, a tight body.
    function snare(at, vol) {
        if (!MIX.snare) return;
        vol = vol || 1;
        hiss(at, 0.09, 0.6 * vol, 2200, "bandpass", 1.2);
        hiss(at, 0.04, 0.35 * vol, 5000);
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(200, at);
        o.frequency.exponentialRampToValueAtTime(160, at + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.45 * vol, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
        o.connect(g); g.connect(dest || master);
        o.start(at); o.stop(at + 0.08);
        counts.snare++;
    }
    function hat(at, vol, open) {
        if (!MIX.hats) return;
        hiss(at, open ? 0.16 : 0.03, vol, open ? 6000 : 7500);
        counts.hat++;
    }
    function crash(at, vol) { if (!MIX.hats) return; hiss(at, 1.1, vol, 5000); counts.crash++; }
    function tom(at, f, vol) { if (!MIX.snare) return; drop(at, 0.2, f, f * 0.6, vol || 0.7); counts.tom++; }

    // ---- the clock
    let timer = 0, playing = false;
    let level = 1, zone = 1, danger = 0;
    let nextAt = 0;              // when the next step sounds, on the audio clock
    let step = 0;                // sixteenth-note steps since the song began
    let counts = {};             // what has been booked, for the dev hook
    let section = "A";           // where the song is, for the dev hook
    const resetCounts = () => { counts = { kick: 0, snare: 0, hat: 0, crash: 0, tom: 0, bass: 0, brass: 0, stab: 0, counter: 0, bell: 0, tine: 0, alarm: 0, piano: 0 }; };
    resetCounts();
    const zoneOf = (n) => Math.min(12, Math.max(1, Math.floor(n) || 1));   // (12: the Quarry's old machine, the jukebox's backup, 23 Oct 2026)   // 1 Wood ... 5 the Station, 6 the secret Heart; 7-10 the new zones (14 Oct 2026)
    const bpm = () => sad ? 66 : style ? STYLES[style].bpm : ((!titleOnly && songs[zoneOf(zone)] && songs[zoneOf(zone)].tempo) || 126);
    const stepLen = () => 15 / bpm();   // a sixteenth at this tempo

    // Which section, which bar of it, and which time round, at a bar.
    function where(bar) {
        const song = songs[zoneOf(zone)];
        const form = sad ? SAD_FORM : titleOnly ? TITLE_FORM : song ? song.form : FORM;
        const total = form.reduce((n, s) => n + s.bars, 0);
        let p = bar % total;
        const pass = Math.floor(bar / total);
        for (const s of form) {
            if (p < s.bars) return { sec: s, b: p, pass };
            p -= s.bars;
        }
        return { sec: form[0], b: 0, pass };
    }

    /* STRIPPED FOR THE DARK (17 Oct 2026, the owner's choice, after the ducked tune and its whispers fell flat:
       "strip the song down to its heartbeat ... but with a soft ghostly lead still present (in time with the
       rest)"). In a dark area the tune plays on in time but holds its breath: the hats and snare, the answering
       parts, the stabs and the lead's own voice drop away within a beat, leaving the kick and the bass; the ghost
       (the epic Mine's lead) takes the tune, softly, note for note; a low choir breathes on each bar's root. Out
       of the dark they come back one by one over a couple of bars, the lead last. (The layers go by the secret
       mixer's switches, set for the one step and put back; the dev mixer's own settings are kept.) */
    function book(at, i) {
        const T = hauntLevel;
        strip += (T - strip) * (T > strip ? 0.35 : 0.03);
        if (strip < 0.005) strip = 0;
        const kept = Object.assign({}, MIX);
        if (strip >= 0.85) { MIX.hats = false; MIX.snare = false; }
        if (strip >= 0.65) MIX.parts = false;
        if (strip >= 0.45) MIX.stabs = false;
        stripLead = strip >= 0.25 && MIX.lead; if (stripLead) MIX.lead = false;
        stripOn = strip >= 0.65;
        dest = musicBus;
        try { bookStep(at, i); } finally { dest = null; Object.assign(MIX, kept); stripLead = false; stripOn = false; }
    }
    /* THE MINE IN OTHER STYLES (22 Oct 2026, the owner's: "make some more versions of our mine zone soundtrack, in
       these genres: pop, house, trance, country/folk (spooky vibe), ambient"). The same song (its sections, chords,
       hook, motif and answers), played by another band at another tempo; chosen in the editor's jukebox only
       (start(..., { style })), the game plays the tune as it was. Each style books its own drums, bass and parts on
       every sixteenth (bookStyle). The sections still shape it: A, the mystery, held back; B, the hook, the full band;
       C, a breakdown and a build back in.
         pop       116: a bright detuned synth on the hook and an electric piano on the motif, plucked eighths in the
                   bass, kick and a clap on the backbeat, eighth hats, a warm pad, piano chords on the beat
         house     124: four on the floor, an open hat on every off-beat, a clap on two and four, a shaker; the
                   classic house piano chords, syncopated; the bass on the off-beats in octaves; everything ducking
                   round the kick
         trance    138: four on the floor, a rolling sixteenth bass (off the kick), a supersaw lead, an arpeggio in
                   sixteenths over the chord, a wide pad, a snare roll and a rising sweep into the drop, the ducking
         folk      92, swung: a banjo picking the chord, a fiddle on the tune, an upright bass on one and three, a
                   stomp and a hollow knock, a low drone of an open fifth, and a thin ghostly whistle over the hook:
                   old, cold and a little haunted
         ambient   70: no drums; slow pads on the chords, the tune on glassy bells far apart in a long echo, a low
                   drone, the wind */
    const STYLES = {
        pop: { bpm: 116, wet: 0.3, fb: 0.3, swing: 0 },
        house: { bpm: 124, wet: 0.28, fb: 0.32, swing: 0 },
        trance: { bpm: 138, wet: 0.4, fb: 0.42, swing: 0 },
        folk: { bpm: 92, wet: 0.32, fb: 0.38, swing: 0.16 },
        ambient: { bpm: 70, wet: 0.7, fb: 0.62, swing: 0 }
    };
    let style = null;
    // the styles' voices
    function superSaw(at, dur, f, vol) {
        for (const c of [-14, -6, 0, 7, 15]) fm(at, dur, f, { vol: vol * 0.24, ratio: 1, index: 2.6, indexTo: 2.1, indexTime: 0.2, attack: 0.015, sustain: 0.85, decay: 0.2, release: 0.08, cents: c, cut: 5200, wet: true });
        fm(at, dur, f / 2, { vol: vol * 0.25, ratio: 1, index: 1.4, attack: 0.02, sustain: 0.8, decay: 0.2, release: 0.08, cut: 1800 });
    }
    const popSynth = (at, dur, f, vol) => { for (const c of [-8, 8]) fm(at, dur, f, { vol: vol * 0.5, ratio: 1, index: 1.9, indexTo: 1.3, indexTime: 0.15, attack: 0.01, sustain: 0.8, decay: 0.15, release: 0.06, cents: c, cut: 4200, vib: 0.005, wet: true }); fm(at, dur, f * 2, { vol: vol * 0.12, ratio: 1, index: 0.6, attack: 0.01, sustain: 0.7, decay: 0.15, release: 0.05, cut: 6000 }); };
    const pluckBass = (at, dur, f, vol) => fm(at, dur, f, { vol, ratio: 1, index: 3, indexTo: 0.6, indexTime: 0.12, from: f * 1.05, sustain: 0.6, decay: 0.1, release: 0.02, cut: 1600 });
    const subBass = (at, dur, f, vol) => fm(at, dur, f, { vol, ratio: 1, index: 0.6, indexTo: 0.3, indexTime: 0.1, attack: 0.006, sustain: 0.8, decay: 0.15, release: 0.03, cut: 700 });
    const housePiano = (at, f, vol) => { fm(at, 0.32, f, { vol, ratio: 1, index: 2.4, indexTo: 0.4, indexTime: 0.25, ring: true, wet: true }); fm(at, 0.12, f * 2, { vol: vol * 0.3, ratio: 3, index: 1.2, indexTo: 0.05, indexTime: 0.08, ring: true }); };
    const pluckArp = (at, f, vol) => fm(at, 0.18, f, { vol, ratio: 2, index: 2.4, indexTo: 0.2, indexTime: 0.12, ring: true, wet: true, cut: 5000 });
    const folkBanjo = (at, f, vol) => { fm(at, 0.42, f, { vol, ratio: 1, index: 3.6, indexTo: 0.35, indexTime: 0.07, ring: true, wet: true, cut: 4200 }); fm(at, 0.05, f * 3, { vol: vol * 0.35, ratio: 1, index: 2, indexTo: 0.1, indexTime: 0.03, ring: true }); };
    const folkFiddle = (at, dur, f, vol) => { fm(at, dur, f, { vol, ratio: 1, index: 1.1, indexTo: 1.9, indexTime: 0.25, attack: 0.07, sustain: 0.85, decay: 0.3, release: 0.12, vib: 0.011, cut: 3400, wet: true }); hiss(at, Math.min(0.15, dur), vol * 0.08, 3200, "bandpass", 3); };
    const uprightBass = (at, dur, f, vol) => fm(at, dur, f, { vol, ratio: 1, index: 1.4, indexTo: 0.3, indexTime: 0.12, attack: 0.01, sustain: 0.45, decay: 0.16, release: 0.05, cut: 900 });
    const whistle = (at, dur, f, vol) => fm(at, dur, f, { vol, ratio: 1, index: 0.05, attack: 0.2, sustain: 0.9, decay: 0.4, release: 0.3, vib: 0.014, wet: true });
    const glass = (at, dur, f, vol) => { fm(at, Math.max(1.6, dur), f, { vol, ratio: 3.5, index: 1.2, indexTo: 0.05, indexTime: 0.6, ring: true, wet: true }); fm(at, Math.max(2.2, dur), f / 2, { vol: vol * 0.4, ratio: 1, index: 0.2, attack: 0.3, sustain: 0.8, decay: 0.8, release: 0.8, wet: true }); };
    function ambientPad(at, dur, f, vol) {
        const p = { ratio: 1, index: 0.25, indexTo: 0.6, indexTime: dur, attack: Math.min(1.6, dur * 0.4), sustain: 0.95, decay: 1, release: 1.4, cut: 1600, wet: true };
        fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: -7 })); fm(at, dur, f, Object.assign({}, p, { vol: vol * 0.5, cents: 7, vib: 0.003 }));
    }
    // a kick that the rest ducks round (the house and the trance), and the claps
    function pumpKick(at, vol, depth) {
        const keep = dest; if (kickBus) dest = kickBus;
        if (MIX.kick) { drop(at, 0.26, 140, 42, 1.05 * vol, 0.06); drop(at, 0.012, 1200, 200, 0.4 * vol); counts.kick++; }
        dest = keep;
        if (duck && depth) { duck.gain.setTargetAtTime(1 - depth, at, 0.004); duck.gain.setTargetAtTime(1, at + 0.03, 0.09); }
    }
    function clap(at, vol) { if (!MIX.snare) return; for (const d of [0, 0.011, 0.023]) hiss(at + d, 0.05, 0.32 * vol, 1500, "bandpass", 0.9); hiss(at + 0.03, 0.18, 0.12 * vol, 1200, "bandpass", 0.7); counts.snare++; }
    function shaker(at, vol) { if (MIX.hats) hiss(at, 0.04, vol, 6500, "bandpass", 1.5); }
    function knock(at, vol) { if (!MIX.snare) return; drop(at, 0.09, 520, 320, 0.4 * vol); hiss(at, 0.02, 0.15 * vol, 2500, "bandpass", 3); counts.snare++; }
    function sweep(at, dur, vol) {
        const s2 = ctx.createBufferSource(); s2.buffer = noise; s2.loop = true;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2; f.frequency.setValueAtTime(400, at); f.frequency.exponentialRampToValueAtTime(7000, at + dur);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, at); g2.gain.exponentialRampToValueAtTime(vol, at + dur * 0.95); g2.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.05);
        s2.connect(f); f.connect(g2); g2.connect(dest || master); s2.start(at); s2.stop(at + dur + 0.1);
    }
    function wind(at, dur, vol) {
        const s2 = ctx.createBufferSource(); s2.buffer = noise; s2.loop = true;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 6; f.frequency.setValueAtTime(300, at); f.frequency.linearRampToValueAtTime(700, at + dur / 2); f.frequency.linearRampToValueAtTime(260, at + dur);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, at); g2.gain.linearRampToValueAtTime(vol, at + dur / 2); g2.gain.linearRampToValueAtTime(0.0001, at + dur);
        s2.connect(f); f.connect(g2); g2.connect(wetBus); g2.connect(dest || master); s2.start(at); s2.stop(at + dur + 0.05);
    }
    function bookStyle(at, s, b, sec, kind, second, last, len, chord, lead, answer, counter) {
        const S = STYLES[style], T = chord.tones, R = chord.root, A = sec.name === "A", B = sec.name === "B", C = sec.name === "C";
        const build = kind === "build", brk = kind === "break";
        if (S.swing && s % 2 === 1) at += S.swing * len;
        if (style === "pop") {
            // drums: kick on one and the "and" of two and three; a clap on two and four; eighth hats (sixteenths in the hook)
            if (!brk) {
                if (MIX.kick && (s === 0 || s === 6 || s === 8 || (B && s === 11))) kick(at, s === 0 ? 1 : 0.85);
                if ((s === 4 || s === 12) && (!A || second)) clap(at, 1);
                if (B ? s % 2 === 0 || s % 4 === 3 : s % 2 === 0) hat(at, s % 4 === 2 ? 0.07 : 0.045);
                if (build && s >= 8) clap(at, 0.4 + (s - 8) * 0.08);
            } else if (s === 0) kick(at, 0.7);
            if (s === 0 && b === 0) crash(at, 0.3);
            // bass: plucked eighths, root and its octave
            if (MIX.bass && s % 2 === 0 && !(brk && s % 8)) { pluckBass(at, len * 1.6, hz(R - 12 + (s % 8 === 6 ? 12 : 0)), A && !second ? 0.36 : 0.46); counts.bass++; }
            // piano chords on the beat (the motif's sections), a pad held under the hook
            if (MIX.stabs && s % 4 === 0 && !B) T.forEach(n => piano(at, len * 3, hz(n), 0.05));
            if (MIX.parts && s === 0) T.forEach(n => warmPad(at, len * 15.5, hz(n - 12), B ? 0.05 : 0.03));
            // the tune: the hook on the bright synth, the motif on the piano; the answers on a pluck
            if (lead && MIX.lead) { if (sec.voice[b] === "bell") piano(at, Math.max(0.3, lead.len * len), hz(lead.note), 0.2); else { popSynth(at, Math.max(0.08, lead.len * len * 0.92), hz(lead.note), 0.2); popSynth(at, Math.max(0.08, lead.len * len * 0.92), hz(lead.note - 12), 0.09); } counts.brass++; }
            if (answer && MIX.parts) pluckArp(at, hz(answer.note), 0.07);
            if (counter && MIX.parts) piano(at, counter.len * len, hz(counter.note - 12), 0.06);
        } else if (style === "house") {
            const depth = 0.42;
            if (!brk) {
                if (s % 4 === 0) pumpKick(at, 1, depth);
                if ((s === 4 || s === 12) && (!A || second || build)) clap(at, 0.9);
                if (s % 4 === 2) hat(at, 0.09, true);
                if (s % 2 === 1 && (B || second)) shaker(at, 0.035);
                if (build && s % 2 === 0 && s >= 8) clap(at, 0.3 + (s - 8) * 0.07);
            } else if (s === 0) pumpKick(at, 0.8, depth);
            if (s === 0 && b === 0) crash(at, 0.25);
            // bass on the off-beat, in octaves
            if (MIX.bass && s % 4 === 2 && !brk) { subBass(at, len * 1.6, hz(R - 12 + (s % 8 === 6 ? 12 : 0)), 0.5); counts.bass++; }
            // the house piano: the chord on 1, the "a" of 1 and the "and" of 2, again in the second half (the classic rhythm)
            if (MIX.stabs && [0, 3, 6, 10, 14].includes(s) && !(A && !second && s !== 0)) T.forEach(n => housePiano(at, hz(n), 0.055));
            if (MIX.parts && s === 0 && (B || brk)) T.forEach(n => warmPad(at, len * 15.5, hz(n - 12), 0.03));
            if (lead && MIX.lead) { if (sec.voice[b] === "bell") housePiano(at, hz(lead.note), 0.15); else { popSynth(at, Math.max(0.08, lead.len * len * 0.85), hz(lead.note), 0.17); } counts.brass++; }
            if (answer && MIX.parts) pluckArp(at, hz(answer.note), 0.06);
        } else if (style === "trance") {
            const depth = 0.5;
            if (!brk) {
                if (s % 4 === 0) pumpKick(at, 1.05, depth);
                if (s % 4 === 2) hat(at, 0.085, true);
                if ((s === 4 || s === 12) && B) clap(at, 0.7);
                if (B && s % 2 === 1) shaker(at, 0.03);
                if (build) { if (s % (s >= 8 ? 1 : 2) === 0) snare(at, 0.25 + s * 0.04); if (s === 0 && b % 2 === 0) sweep(at, len * 32, 0.12); }
            } else { if (s === 0 && b === 0) sweep(at, len * 32, 0.08); }
            if (s === 0 && b === 0) crash(at, 0.35);
            // the rolling bass: three of every four sixteenths, off the kick
            if (MIX.bass && s % 4 !== 0 && !brk) { subBass(at, len * 0.9, hz(R - 12 + (s % 4 === 3 ? 12 : 0)), 0.38); counts.bass++; }
            // the arpeggio, sixteenths up and down the chord, two octaves; the pad wide under it
            if (MIX.parts && (!A || second || build)) { const seq = [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3][s], n = T[seq % 3] + 12 * Math.floor(seq / 3); pluckArp(at, hz(n), B ? 0.05 : 0.04); }
            if (MIX.parts && s === 0) T.forEach(n => warmPad(at, len * 15.8, hz(n), B ? 0.045 : 0.035));
            if (lead && MIX.lead) { const d = Math.max(0.08, lead.len * len * 0.92); if (sec.voice[b] === "bell") pluckArp(at, hz(lead.note), 0.13); else { superSaw(at, d, hz(lead.note), 0.22); superSaw(at, d, hz(lead.note + 12), 0.08); } counts.brass++; }
            if (counter && MIX.parts) superSaw(at, counter.len * len * 0.9, hz(counter.note - 12), 0.07);
        } else if (style === "folk") {
            // a stomp on one and three, a hollow knock on two and four (soft in the mystery), a brush between
            if (!brk || s === 0) {
                if (MIX.kick && (s === 0 || s === 8)) drop(at, 0.22, 110, 50, A && !second ? 0.55 : 0.75, 0.05);
                if ((s === 4 || s === 12) && !brk) knock(at, A && !second ? 0.6 : 1);
                if (!A && s % 4 === 2) hiss(at, 0.06, 0.04, 4000, "highpass");
            }
            // the drone: a low open fifth under every bar, cold
            if (MIX.parts && s === 0) { fm(at, len * 16, hz(R - 24), { vol: 0.09, ratio: 1, index: 0.8, indexTo: 1.2, indexTime: 2, attack: 0.4, sustain: 0.9, decay: 1, release: 0.6, cut: 700, wet: true }); fm(at, len * 16, hz(R - 17), { vol: 0.05, ratio: 1, index: 0.6, attack: 0.5, sustain: 0.9, decay: 1, release: 0.6, cut: 700, wet: true }); }
            // the upright bass: root on one, the fifth on three, a walk at the end of the hook's bars
            if (MIX.bass && !brk && (s === 0 || s === 8 || (B && s === 14))) { uprightBass(at, len * 3.5, hz(R - 12 + (s === 8 ? 7 : s === 14 ? 10 : 0)), 0.42); counts.bass++; }
            // the banjo, picking the chord: root, fifth, octave, third, in a roll
            if (MIX.stabs && s % 2 === 0 && (!A || second || s % 4 === 0)) { const roll = [0, 2, 3, 1, 0, 3, 2, 1][(s / 2) % 8], n = roll === 3 ? T[0] + 12 : T[roll % 3]; folkBanjo(at, hz(n), A ? 0.05 : 0.065); }
            // the tune on the fiddle; over the hook a thin ghostly whistle an octave up, far back
            if (lead && MIX.lead) { const d = Math.max(0.12, lead.len * len * 0.95); folkFiddle(at, d, hz(lead.note - 12), 0.15); if (B && second) whistle(at, d, hz(lead.note + 12), 0.025); counts.brass++; }
            if (answer && MIX.parts) folkBanjo(at, hz(answer.note), 0.06);
            if (counter && MIX.parts) folkFiddle(at, counter.len * len, hz(counter.note - 24), 0.07);
        } else if (style === "ambient") {
            // the pads: each chord held long, slow to rise; the drone; the wind now and then
            if (MIX.parts && s === 0) { T.forEach(n => ambientPad(at, len * 16 + 1, hz(n), 0.05)); ambientPad(at, len * 16 + 1, hz(T[0] + 12), 0.02); }
            if (MIX.bass && s === 0 && b % 2 === 0) fm(at, len * 32, hz(R - 24), { vol: 0.12, ratio: 1, index: 0.3, attack: 1.5, sustain: 0.9, decay: 2, release: 2, cut: 400, wet: true });
            if (s === 0 && b % 4 === 1) wind(at, len * 24, 0.05);
            // the tune, sparse, on glass bells far apart: the hook's long notes, the motif's first notes, in the long echo
            if (lead && MIX.lead && (lead.len >= 2 || s === 0)) { glass(at, lead.len * len * 1.5, hz(lead.note), A ? 0.07 : 0.09); counts.bell++; }
            if (answer && MIX.parts && second) glass(at, 1.6, hz(answer.note + 12), 0.03);
        }
    }
    function bookStep(at, i) {
        const bar = Math.floor(i / STEPS), s = i % STEPS;
        const { sec, b, pass } = where(bar);
        // a shuffle: the off-beats late, as a band swings them
        { const bz = BANDS[zoneOf(zone)]; if (bz && bz.swing && !sad && !titleOnly) at += bz.swing[s % 4] * stepLen(); }
        section = sec.name;
        const second = pass % 2 === 1;   // the second time round
        const last = b === sec.bars - 1;
        const len = stepLen();
        const chord = chordAt(sec.chords[b], s);
        const lead = sec.leadSteps[b][s];
        const answer = sec.answerSteps[b][s];
        const counter = sec.counterSteps[b][s];

        // The echo repeats a dotted eighth later, whatever the tempo.
        if (s === 0) delay.delayTime.setTargetAtTime(Math.min(0.95, 3 * len), at, 0.05);

        if (sad) {
            // B to Bb, A to Ab: the leading tone and the Dorian sixth gone.
            const minor = (n) => (n % 12 === 11 || n % 12 === 9 ? n - 1 : n);
            if (lead) { piano(at, Math.max(1, lead.len * len * 1.2), hz(minor(lead.note) - (sec.name === "B" ? 0 : 12)), 0.3); counts.piano++; }
            if (answer) { piano(at, 0.9, hz(minor(answer.note) - 12), 0.12); counts.piano++; }
            if (s % 8 === 0) fm(at, len * 7.5, hz(minor(chord.root)), { vol: 0.4, ratio: 1, index: 0.8, indexTo: 0.2, indexTime: 0.4, attack: 0.02, sustain: 0.7, decay: 0.5 });
            return;
        }

        if (style) { bookStyle(at, s, b, sec, sec.drums[b], second, last, len, chord, lead, answer, counter); return; }
        const z = zoneOf(zone);
        const down = 0;
        const kind = sec.drums[b];
        const band = BANDS[z];

        // The lead: the motif's voice (A, C's breakdown) or the hook's (B,
        // C's build), a touch louder on the downbeat. The second time round
        // the motif's voice doubles the hook, up where the hook was written.
        if (lead && stripLead) {
            const bell = sec.voice[b] === "bell";
            ghostNote(at, bell ? 0.55 : Math.max(0.2, lead.len * len * 0.95), hz(lead.note - (bell ? band.motifDown : band.hookDown)), (s === 0 ? 0.12 : 0.105));
        } else if (lead && MIX.lead) {
            const acc = (s === 0 ? 1.15 : 1) * band.lead;
            const harm = band.harmony && !titleOnly;
            if (sec.voice[b] === "voice" && band.vocal) {
                // (23 Oct 2026, the Quarry's folk) the woman's voice, alone, an octave under where it is written
                band.vocal(at, Math.max(0.25, lead.len * len * 0.98), hz(lead.note - 12), 0.12 * acc);
                counts.brass++;
            } else if (sec.voice[b] === "bell") {
                band.motif(at, 0.7, hz(lead.note - band.motifDown), 0.15 * acc);
                if (harm) band.motif(at, 0.6, hz(harmonyBelow(lead.note, chord) - band.motifDown), 0.085 * acc);
                counts.bell++;
            } else {
                const hd = Math.max(0.06, lead.len * len * 0.9);
                band.hook(at, hd, hz(lead.note - band.hookDown), 0.17 * acc);
                if (harm) {
                    band.hook(at, hd, hz(harmonyBelow(lead.note, chord) - band.hookDown), 0.1 * acc);
                    if (lead.len >= 3) bowed(at, hd * 1.05, hz(lead.note - band.hookDown), 0.045 * acc);
                }
                counts.brass++;
                if (second && sec.name === "B") {
                    if (band.vocal) band.vocal(at, hd, hz(lead.note - band.hookDown), 0.065 * acc);   // (the Quarry's folk: her voice with the hook)
                    else band.double(at, 0.35, hz(lead.note - down), 0.05);
                    counts.bell++;
                }
            }
        }
        if (answer && MIX.parts) { band.answer(at, 0.5, hz(answer.note - band.answerDown), 0.12); counts.bell++; }
        if (counter && MIX.parts) { (band.counter || band.hook)(at, counter.len * len * 0.95, hz(counter.note - (band.counter ? 0 : band.hookDown)), band.counter ? 0.12 : 0.08); counts.counter++; }

        // (21 Oct 2026) the Mine's pad, a chord held under each bar or half-bar
        if (band.pad && !titleOnly && MIX.parts && (s === 0 || (s === 8 && sec.chords[b].includes(" ")))) {
            const half = sec.chords[b].includes(" "), dur = (half ? 8 : 16) * len * 0.98;
            const pv = kind === "full" ? 0.05 : kind === "build" ? 0.06 : kind === "break" ? 0.035 : second ? 0.04 : 0.032;
            chord.tones.forEach((n, i) => (band.padVoice || warmPad)(at, dur, hz(n - 12), pv * (i === 0 ? 1 : 0.8)));
        }
        // Stabs: B on the "and" of two and four; A the second time round on
        // the "and" of four.
        if (band.oompah) {
            // the off-beat chick, on two and four (soft through the motif, full through the hook)
            if ((s === 4 || s === 12) && (kind === "steady" || kind === "full") && !(last && s === 12 && kind === "full")) { if (MIX.stabs) chord.tones.slice(0, 3).forEach(n => band.stab(at, hz(n), kind === "full" ? 0.09 : 0.06)); counts.stab++; }
        } else if (!band.cellos && !band.noStabs && ((kind === "full" && (s === 6 || s === 14) && !(last && s === 14)) || (kind === "steady" && second && s === 14 && !last))) {
            if (MIX.stabs) chord.tones.slice(0, 3).forEach(n => band.stab(at, hz(n - down), kind === "full" ? 0.08 : 0.05));
            counts.stab++;
        }

        // The bass.
        const groove = sec.groove[b] === "M1" && second ? "M2" : sec.groove[b];
        const g = GROOVE_STEPS[groove][s];
        if (!MIX.bass) { /* silenced by the dev mixer */ }
        else if (band.pump) {
            // the Quarry: the bass pumping octaves in eighths, the machine's drive
            const bv = band.bassVoice ? (t, d, f, gr, v) => band.bassVoice(t, d, f, v) : bass;
            if (s % 2 === 0 && kind !== "break") { bv(at, len * 1.4, hz(chord.root + (s % 4 === 2 ? 12 : 0)), true, (s % 4 === 0 ? 0.62 : 0.5) * band.bass); counts.bass++; }
            else if (kind === "break" && s % 8 === 0) { bv(at, len * 6, hz(chord.root), true, 0.55 * band.bass); counts.bass++; }
        } else if (band.oompah) {
            // oom on one, pah on three a fifth down; through the hook a walk up into the next bar
            const walk = kind === "full" && s === 14 && b % 2 === 1;
            if (s === 0 || s === 8 || walk) { tuba(at, len * (walk ? 1.6 : 3.4), hz(chord.root + (s === 8 ? -5 : walk ? 2 : 0)), 0.5 * band.bass); counts.bass++; }
            if (kind === "build" && s % 4 === 0) { tuba(at, len * 1.8, hz(chord.root + [0, 4, 7, 12][s / 4]), 0.45 * band.bass); counts.bass++; }
        } else if (band.hurdy) {
            /* (23 Oct 2026) THE QUARRY'S FOLK: the hurdy-gurdy's drones held under every bar, the low D and its A (the A left
               out under a B flat or a G minor, where it would grind); its buzzing trompette on the 3+3+2 through the hook, the
               build and the motif's second time; and through the hook and the build the cellos driving the same 3+3+2 on the
               chord's root, up an octave on the last of each three */
            const D = [0, 3, 6, 8, 11, 14].includes(s), name = sec.chords[b];
            if (s === 0) { drone(at, len * 16, hz(38), /^(Bb|Gm)/.test(name) ? null : hz(45), (kind === "full" ? 1 : kind === "break" ? 0.75 : 0.85) * band.bass); counts.bass++; }
            if (D && (kind === "full" || kind === "build" || (kind === "steady" && second))) chien(at, hz(50), (s % 8 === 0 ? 0.07 : 0.045) * band.bass);
            if (D && (kind === "full" || kind === "build")) { cello(at, len * (s % 8 === 6 ? 1.8 : 2.7), hz(chord.root + (s % 8 === 6 ? 12 : 0)), (s % 8 === 0 ? 0.24 : 0.18) * band.bass); counts.bass++; }
        } else if (band.drone) {
            // the Tomb: one low note held under every bar, its fifth above it
            if (s === 0) { fm(at, len * 15.5, hz(chord.root), { vol: 0.2, ratio: 1, index: 0.6, indexTo: 0.3, indexTime: 1, attack: 0.1, sustain: 0.85, decay: 0.6, release: 0.2, cut: 900 }); fm(at, len * 15.5, hz(chord.root + 7), { vol: 0.08, ratio: 1, index: 0.3, attack: 0.2, sustain: 0.85, decay: 0.6, release: 0.2, cut: 900 }); counts.bass++; }
        } else if (band.toll || band.sparse) {
            // one soft round note a bar (the Dark), or on one and three (Ice)
            if (s === 0 || (band.sparse && s === 8)) { fm(at, band.toll ? 0.5 : 0.35, hz(chord.root), { vol: band.toll ? 0.2 : 0.22, ratio: 1, index: 0.5, indexTo: 0.15, indexTime: 0.2, attack: 0.02, sustain: 0.6, decay: 0.2, release: 0.06 }); counts.bass++; }
        } else if (g || heavy === 2) {
            const bk = band.bass * (heavy === 2 ? 0.5 : 1);
            if (g) {
                const n = chord.root + (g.iv === "top" ? chord.top : g.iv);
                if (g.dead) deadNote(at, hz(chord.root + 12));
                else if (sec.bassVoice[b] === "muted") mutedBass(at, hz(n), z === 2 || band.gritty, bk);
                else bass(at, Math.max(0.06, g.len * len * 0.75), hz(n), z === 2 || band.gritty, (s % 4 === 0 ? 0.65 : 0.55) * bk);
                counts.bass++;
            }
            if (heavy === 2) {
                // the 808s, with the kick: the hook's syncopation through B, one and three in A, the build climbing
                const hit = kind === "full" ? [0, 3, 8, 11, 14].includes(s) : kind === "build" ? s % 4 === 0 : kind === "break" ? s === 0 : (s === 0 || s === 8 || (second && s === 14));
                if (hit) {
                    const up = kind === "build" ? [0, 0, 5, 7][s / 4] : kind === "full" && s === 14 ? 7 : 0;
                    const next = kind === "full" ? ({ 0: 3, 3: 5, 8: 3, 11: 3, 14: 2 })[s] : kind === "build" ? 4 : kind === "break" ? 16 : s === 14 ? 2 : (second ? 6 : 8);
                    sub808(at, next * len * 0.95, hz(chord.root - 12 + up), kind === "full" ? 0.62 : 0.55);
                }
            }
        }

        // (14 Oct 2026) the Steamworks' cellos: a bowed pulse in eighths on the chord, root, root, fifth, root, third, root, fifth, third
        if (band.cellos && MIX.bass && kind !== "full" && s % 2 === 0) {
            const T = chord.tones, seq = [T[0], T[0], T[2], T[0], T[1], T[0], T[2], T[1]], n = seq[s / 2] - 12;
            fm(at, len * 1.9, hz(n), { vol: (kind === "full" ? 0.1 : 0.075) * (s % 8 === 0 ? 1.2 : 1), ratio: 1, index: 1.3, indexTo: 0.5, indexTime: 0.12, attack: 0.025, sustain: 0.6, decay: 0.2, release: 0.08, cut: 1300 });
            counts.bass++;
        }
        // (14 Oct 2026) the Steamworks' strings, running up and down the chord in sixteenths through the flight; brass stabs driving the climb
        if (band.strings && MIX.parts && kind === "full") {
            const T = chord.tones, idx = [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3][s], n = T[idx % 3] + 12 * Math.floor(idx / 3);
            fm(at, len * 1.6, hz(n), { vol: 0.042, ratio: 1, index: 0.6, indexTo: 0.3, indexTime: 0.1, attack: 0.02, sustain: 0.7, decay: 0.15, release: 0.1, wet: true });
        }
        // (23 Oct 2026) the Arcade's arpeggio: the chord up and down in sixteenths, an octave and two over, through the hook and the climb (and the motif's second time)
        if (band.arp && MIX.parts && (kind === "full" || kind === "build" || (kind === "steady" && second))) {
            const T = chord.tones, k = [0, 1, 2, 3, 4, 5, 4, 3][s % 8], n = T[k % 3] + 12 * (1 + Math.floor(k / 3));
            arpPluck(at, hz(n), (kind === "full" ? 0.05 : 0.038) * (s % 4 === 0 ? 1.15 : 1));
        }
        if (band.strings && MIX.stabs && (kind === "break" || kind === "build") && [0, 3, 6, 10, 12].includes(s)) { chord.tones.slice(0, 3).forEach(n => band.stab(at, hz(n), s === 0 ? 0.09 : 0.065)); counts.stab++; }
        /* THE DARK, EERIER (13 Oct 2026, the owner's: "slightly more eerie"):
           a low choir held under every bar on the chord's root, and every
           other bar a faint high voice a semitone off the chord, swelling in
           slowly and wavering, then gone. */
        if (stripOn && s === 0) choir(at, len * 15.5, hz(chord.root + 12), 0.05 * strip);
        if (z === 4 && s === 0 && !stripOn) choir(at, len * 15.5, hz(chord.root + 12), 0.07);
        if (z === 4 && s === 4 && b % 2 === 1 && !stripOn) fm(at, len * 10, hz(chord.root + 37), { vol: 0.035, ratio: 1, index: 0.1, indexTo: 0.15, indexTime: 0.5, attack: 0.5, sustain: 0.9, decay: 0.6, release: 0.5, vib: 0.02, wet: true });

        // Ice's tines, in sixteenths, all through.
        if (z === 3 && !stripOn) {
            tine(at, hz(chord.tones[[0, 1, 2, 1][s % 4]] + 24 + (s >= 8 ? 12 : 0)), 0.05);
            counts.tine++;
        }

        drums(at, kind, b, s, last, second, sec, z);

        // THE WARNING.
        if (danger > 0.02) {
            const every = danger < 0.35 ? 4 : danger < 0.7 ? 2 : 1;
            if (s % every === 0) {
                const k = s / every;
                const base = 72 + Math.round(danger * 10);
                fm(at, Math.min(0.09, len * every * 0.7), hz(base + ALARM[k % ALARM.length]), { vol: 0.06 + danger * 0.1, ratio: 2, index: 2, indexTo: 0.5, indexTime: 0.06, sustain: 0.5, decay: 0.03 });
                counts.alarm++;
            }
            // The last stretch: a low throb on each beat under it.
            if (danger > 0.85 && s % 4 === 0) drop(at, len * 3, hz(48), hz(43), 0.35);
        }
    }

    /* The drums, by pattern (see THE FORM):
         steady  A: kick on 1, the "and" of 2 and 3, a light snare on 2 and
                 4, eighth hats (sixteenths the second time); toms to end
         full    B: the same kick harder (and on the "and" of 3 every other
                 bar), full snare, sixteenth hats kept low, an open hat on
                 the "and" of 4; a snare roll through the last half-bar
         break   C1-2: half-time, kick on 1 and 3, the snare on 4 alone
         build   C3-4: four on the floor, a snare roll growing from eighths
                 to sixteenths
       Stone adds kicks; the Dark has no closed hats and a softer snare. */
    function drums(at, kind, b, s, last, second, sec, z) {
        if (z >= 7 && z <= 11 && (kind === "steady" || kind === "full" || z === 9)) {
            const full = kind === "full";
            if (s === 0 && b === 0) crash(at, full ? 0.12 : 0.06);
            if (last && s >= 12 && !full) { tom(at, [220, 180, 150, 120][s - 12], 0.5); return; }
            if (full && last && s >= 8) { snare(at, 0.3 + (s - 8) * 0.08); return; }
            if (z === 7) {
                // THE VAULT: tick on the beat, tock between; a kick on one and three; a ratchet winding at the end of the bar
                if (MIX.hats && s % 2 === 0) block(at, s % 4 === 0, s % 4 === 0 ? 0.12 : 0.07);
                if (s === 0 || s === 8) kick(at, 0.85);
                if (full && (s === 4 || s === 12)) snare(at, 0.5);
                if (s === 14 && MIX.hats) for (let i = 0; i < 4; i++) hiss(at + i * 0.025, 0.012, 0.05, 5000, "bandpass", 3);
            } else if (z === 8) {
                // THE TOMB: the darbuka's maqsum (dum, tek, tek, dum, tek), a roll of fingers between
                if (MIX.kick && (s === 0 || s === 8 || (full && s === 10))) dum(at, s === 0 ? 1 : 0.85);
                if (MIX.snare && (s === 2 || s === 6 || s === 12 || (full && s === 14))) tek(at, s === 12 ? 1 : 0.75);
                if (MIX.hats && s % 2 === 1) hiss(at, 0.02, full ? 0.03 : 0.02, 6000, "bandpass", 2);
            } else if (z === 9) {
                if (kind === "steady") {
                    // the works waking: an engine's chug, a clock ticking (soft), clanks on two and four, steam let off
                    if (s === 0 || s === 3 || s === 8 || s === 11) kick(at, s % 8 === 0 ? 0.75 : 0.5);
                    if (s === 0 && b % 2 === 0) tom(at, 78, 0.5);
                    if (MIX.hats && s % 4 === 0) fm(at, 0.03, 2600, { vol: 0.016, ratio: 1.5, index: 2, indexTo: 0.2, indexTime: 0.02 });
                    if (MIX.hats && s % 4 === 2) fm(at, 0.03, 1700, { vol: 0.011, ratio: 1.5, index: 2, indexTo: 0.2, indexTime: 0.02 });
                    if (MIX.snare && (s === 4 || s === 12)) clank(at, 0.06);
                    if (MIX.hats && s === 14 && b % 2 === 1) hiss(at, 0.35, 0.05, 1800, "bandpass", 0.7);
                } else if (kind === "full") {
                    // flight: timpani on the downbeat, a roll of toms rising into each new phrase
                    if (s === 0) { kick(at, 0.9); tom(at, 82, 0.65); }
                    if (s === 8) tom(at, 98, 0.45);
                    if (b % 2 === 1 && s >= 12) tom(at, [88, 100, 115, 130][s - 12], 0.35);
                } else {
                    // the climb: the kick driving in eighths, the snare on two and four, toms into each bar, a crash every other
                    if (s % 2 === 0) kick(at, s % 8 === 0 ? 1.1 : 0.8);
                    if (s === 4 || s === 12) snare(at, kind === "build" ? 0.9 : 0.7);
                    if (s === 14 || s === 15) tom(at, s === 14 ? 120 : 100, 0.5);
                    if (s === 0 && b % 2 === 0) crash(at, 0.1);
                }
            } else if (z === 11) {
                // THE ARCADE (23 Oct 2026, synthwave): a LinnDrum. The motif on one and three (the and of two the second bar), the
                // gated snare on two and four, eighth hats; the hook four on the floor, sixteenth hats with an open one off each beat
                if (full) { if (s % 4 === 0) kick(at, s === 0 ? 1.1 : 0.95); }
                else if (s === 0 || s === 8 || (b % 2 === 1 && s === 6)) kick(at, s === 0 ? 1 : 0.85);
                if (s === 4 || s === 12) gatedSnare(at, full ? 0.95 : 0.7);
                if (MIX.hats) { if (full) hat(at, s % 4 === 2 ? 0.07 : s % 2 ? 0.025 : 0.04, s % 4 === 2); else if (s % 2 === 0) hat(at, s % 4 === 2 ? 0.05 : 0.03); }
            } else {
                // THE RUINS: bongos talking, a shaker, a soft kick
                if (MIX.snare && [0, 3, 6, 8, 10, 12, 14].includes(s)) bongo(at, s === 3 || s === 6 || s === 10 || s === 14, full ? 0.45 : 0.32);
                if (s === 0 || s === 8) kick(at, 0.7);
                if (MIX.hats) hiss(at, 0.04, s % 4 === 2 ? 0.04 : 0.022, 7000, "bandpass", 1.2);
            }
            return;
        }
        if (z === 2) {
            /* THE QUARRY, FOURTH TIME (23 Oct 2026): war drums and a frame drum in the 3+3+2 of the folk dances (one, the "a"
               of two, the "and" of three; the same again), a tambourine's jingles. The motif: the davul on one and three,
               the frame drum on the 3+3+2 between, jingles the second time; the hook: the davul on all six, the frame drum's
               slap on two and four, jingles in eighths; a roll of both into each section; the breakdown a drum alone; the
               build the davul in quarters, the frame drum rolling up. */
            const full = kind === "full", D = [0, 3, 6, 8, 11, 14].includes(s);
            if (kind === "steady") {
                if (last && s >= 12) { frame(at, 0.5 + (s - 12) * 0.12); if (s === 12) davul(at, 0.8); return; }
                if (s === 0 || s === 8) davul(at, s === 0 ? 0.9 : 0.7);
                else if (D) frame(at, second ? 0.5 : 0.35);
                if (second && s % 2 === 1) jingle(at, 0.018);
            } else if (full) {
                if (last && s >= 8) { frame(at, 0.4 + (s - 8) * 0.07); if (s % 2 === 0) davul(at, 0.55 + (s - 8) * 0.05); return; }
                if (D) davul(at, s % 8 === 0 ? 1.1 : 0.78);
                if (s === 4 || s === 12) frame(at, 0.9);
                if (s % 2 === 0) jingle(at, s % 4 === 2 ? 0.045 : 0.028);
            } else if (kind === "break") {
                if (s === 0) davul(at, 0.85);
                if (s === 11 && b % 2 === 1) frame(at, 0.4);
            } else if (kind === "build") {
                const first = sec.drums[b + 1] === "build";
                if (s % 4 === 0) davul(at, 0.95);
                if (first ? s % 2 === 0 : true) frame(at, first ? 0.3 + s * 0.02 : 0.45 + s * 0.03);
            }
            return;
        }
        if (z === 12 && (kind === "steady" || kind === "full")) {
            // THE QUARRY, THIRD TIME (now the jukebox's backup, zone 12): a machine. The kick chugs (one, the and of one, three, the and of three), metal clanks on
            // two and four, sixteenths of hat accented off the beat like a piston's chuff, steam let off at the end of every other bar
            if (s === 0 && b === 0) crash(at, kind === "full" ? 0.12 : 0.07);
            if (kind === "steady" && last && s >= 12) { tom(at, [200, 170, 140, 110][s - 12], 0.6); if (s === 12) kick(at); return; }
            if (kind === "full" && last && s >= 8) { snare(at, 0.35 + (s - 8) * 0.09); return; }
            if (s === 0 || s === 3 || s === 8 || s === 11 || (kind === "full" && s === 14)) kick(at, s % 8 === 0 ? 1.15 : 0.95);
            if (s === 4 || s === 12) { if (MIX.snare) clank(at, kind === "full" ? 0.12 : 0.09); if (kind === "full") snare(at, 0.5); }
            if (MIX.hats) hat(at, s % 4 === 2 ? 0.1 : s % 2 ? 0.03 : 0.05, s % 4 === 2 && kind === "full");
            if (s === 14 && b % 2 === 1 && MIX.hats) hiss(at, 0.3, 0.06, 1800, "bandpass", 0.7);
            return;
        }
        if (false) {
            // THE QUARRY: a train beat. Kick on one and three, a brushed snare on two and four, a shaker swung, a hammer on a chisel
            if (s === 0 && b === 0) crash(at, sec.name === "B" ? 0.12 : 0.06);
            if (kind === "steady" && last && s >= 12) { tom(at, [220, 180, 150, 120][s - 12], 0.55); return; }
            if (s === 0 || s === 8 || (kind === "full" && b % 2 === 1 && s === 10)) kick(at, s === 0 ? 1 : 0.85);
            if (kind === "full" && last && s >= 8) { snare(at, 0.3 + (s - 8) * 0.08); return; }
            if (s === 4 || s === 12) { snare(at, kind === "full" ? 0.75 : 0.4); hiss(at, 0.12, kind === "full" ? 0.05 : 0.035, 3000, "bandpass", 0.8); }
            if (s % 2 === 0 && MIX.hats) hiss(at, 0.05, s % 4 === 2 ? 0.045 : 0.028, 6500, "bandpass", 1.5);
            if (s === 14 && MIX.hats) clink(at, kind === "full" ? 0.05 : 0.04);
            return;
        }
        const snareVol = z === 4 ? 0.6 : 1;
        const closed = (v) => { if (z !== 4) hat(at, v); };
        if (s === 0 && b === 0) crash(at, sec.name === "B" ? 0.14 : 0.08);
        const extra = z === 12 && (s === 3 || s === 14);   // (the Quarry's machine, now zone 12: its breakdown's extra kicks)
        if (kind === "steady") {
            if (last && s >= 12) { tom(at, [240, 200, 160, 120][s - 12], 0.7); if (s === 12) kick(at); return; }
            if (s === 0 || s === 6 || s === 8 || extra) kick(at, s === 0 ? 1.1 : 0.9);
            if (s === 4 || s === 12) snare(at, 0.55 * snareVol);
            if (second) closed(s % 4 === 2 ? 0.09 : s % 2 ? 0.035 : 0.06);
            else if (s % 2 === 0) closed(s % 4 === 2 ? 0.07 : 0.045);
        } else if (kind === "full") {
            if (z === 5) { if (s % 4 === 0) kick(at, s === 0 ? 1.2 : 1); if (last && s >= 8) { snare(at, 0.35 + (s - 8) * 0.09); return; } if (s === 4 || s === 12) snare(at, 1); if (s % 4 === 2) hat(at, 0.09, true); else closed(0.04); return; }
            if (s === 0 || s === 6 || s === 8 || (b % 2 === 1 && s === 11) || extra) kick(at, s === 0 ? 1.2 : 1);
            if (last && s >= 8) { snare(at, (0.35 + (s - 8) * 0.09) * snareVol); return; }
            if (s === 4 || s === 12) snare(at, snareVol);
            if (s === 14 && b % 2 === 0) hat(at, 0.09, true);
            else closed(s % 4 === 2 ? 0.1 : s % 2 ? 0.035 : 0.06);
        } else if (kind === "break") {
            if (s === 0 || s === 8 || extra) kick(at, s === 0 ? 1.1 : 0.9);
            if (s === 12) snare(at, snareVol);
            if (s % 2 === 0) closed(0.05);
        } else if (kind === "build") {
            if (s % 4 === 0) kick(at, 1);
            const first = sec.drums[b + 1] === "build";
            if (first ? s % 2 === 0 : true) snare(at, (first ? 0.3 + s * 0.02 : 0.45 + s * 0.035) * snareVol);
        }
    }

    function tick() {
        if (!ctx) return;
        /* Fallen behind (a long stall on the page, or a timer held back):
           the steps already past are let go rather than all booked at once
           into the same instant, which in Pura came out as a burst of noise
           (10 Oct 2026). */
        if (nextAt < ctx.currentTime - 0.25) {
            const behind = Math.ceil((ctx.currentTime - nextAt) / stepLen());
            step += behind;
            nextAt += behind * stepLen();
        }
        // Held for a lost life (see lifeLost): nothing new until then.
        if (nextAt < holdUntil) nextAt = holdUntil;
        while (nextAt < ctx.currentTime + 0.12) {
            book(nextAt, step++);
            nextAt += stepLen();
        }
    }

    function run() {
        playing = true;
        clearInterval(timer);
        timer = setInterval(tick, 25);
    }

    /* From the top, at a level. `opts.muffled` for the splash and the other
       screens between games; `opts.zone` to start in a zone other than Wood.
       The track comes in on a short fade rather than cutting in. */
    function start(lv, opts) {
        if (!setup()) return;
        level = Number(lv) || 1;
        if (opts && opts.zone) zone = zoneOf(opts.zone);
        step = 0;
        danger = 0;
        resetCounts();
        muffled = Boolean(opts && opts.muffled);
        titleOnly = Boolean(opts && opts.title);
        setHeavy(Number(opts && opts.heavy) || 0, ctx.currentTime);
        style = opts && STYLES[opts.style] ? opts.style : null;
        { const S = style ? STYLES[style] : null; wetBus.gain.setValueAtTime(S && S.wet != null ? S.wet : 0.35, ctx.currentTime); feedback.gain.setValueAtTime(S && S.fb != null ? S.fb : 0.35, ctx.currentTime); }
        if (titleOnly) zone = 1;   // (14 Oct 2026) the title is the Mine's tune in the Mine's band, whatever zone was last played (it kept the last zone's instruments and echo after quitting a level)
        sad = false;
        wake();
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(0, t);
        master.gain.linearRampToValueAtTime(loudness(), t + 0.6);
        lowpass.frequency.cancelScheduledValues(t);
        lowpass.frequency.setValueAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, t);
        colour(t);
        nextAt = t + 0.06;
        holdUntil = 0;
        run();
    }

    // The zone's colour: the shade filter (dulled in the Dark) and the echo.
    function colour(t) {
        const z = sad ? 0 : zoneOf(zone);
        shade.frequency.cancelScheduledValues(t);
        shade.frequency.setTargetAtTime(z === 4 ? DARK_HZ : OPEN_HZ, t, 0.4);
        // (23 Oct 2026: the Quarry's folk in a bigger hall, as the score is)
        wetBus.gain.setTargetAtTime((MIX.echo ? 1 : 0) * (z === 4 ? 0.55 : z === 3 || z === 5 || z === 2 ? 0.45 : sad ? 0.5 : 0.35), t, 0.2);
        feedback.gain.setTargetAtTime(z === 4 || sad ? 0.5 : z === 5 || z === 2 ? 0.42 : 0.35, t, 0.2);
    }

    /* Muffled or open, eased over a fifth of a second so it sounds like a
       door closing rather than a switch. */
    function setMuffled(on) {
        muffled = Boolean(on);
        if (!ctx) return;
        const t = ctx.currentTime;
        lowpass.frequency.cancelScheduledValues(t);
        lowpass.frequency.setTargetAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, t, 0.06);
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(loudness(), t, 0.06);
    }

    /* A browser starts no sound until the page has been clicked or a key
       pressed; a context made before that waits for the first press
       anywhere on the page and starts then. */
    let waiting = false;
    function wake() {
        if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
        try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not yet */ }
        if (waiting || typeof document === "undefined") return;
        waiting = true;
        const go = () => {
            waiting = false;
            document.removeEventListener("pointerdown", go, true);
            document.removeEventListener("keydown", go, true);
            if (ctx && playing && ctx.state !== "running" && ctx.state !== "closed") {
                try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* still not */ }
            }
        };
        document.addEventListener("pointerdown", go, true);
        document.addEventListener("keydown", go, true);
    }

    function stop() {
        playing = false;
        danger = 0;
        clearInterval(timer);
    }

    // Pausing stops the audio clock itself, so nothing booked plays on.
    function pause() {
        if (ctx && ctx.state === "running") {
            try { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* fine */ }
        }
    }
    /* Safari also has "interrupted" (a call, another tab's audio, the phone
       locked), so anything but running or closed is woken. */
    function resume() { if (ctx && playing && ctx.state !== "running" && ctx.state !== "closed") wake(); }

    function setLevel(lv) { level = Number(lv) || 1; }

    // The zone's colour, quietly (no jingle): see ZONES.
    function setZone(n) {
        zone = zoneOf(n);
        if (ctx) colour(ctx.currentTime);
    }

    // How near the water is, 0 (off) to 1 (about to go under): THE WARNING.
    function setDanger(x) {
        const v = Number(x);
        danger = v > 0 ? Math.min(1, v) : 0;
    }

    function setMuted(m) {
        muted = Boolean(m);
        try { localStorage.setItem(STORE, muted ? "off" : "on"); } catch (e) { /* not remembered */ }
        if (ctx) {
            master.gain.cancelScheduledValues(ctx.currentTime);
            master.gain.setTargetAtTime(loudness(), ctx.currentTime, 0.05);
        }
    }

    // ---- sound effects. Each is safe before start() and does nothing muted
    // or with no audio; `sfx` hands back the time to play at, or -1.
    /* Only on a running clock (12 Oct 2026): booked while suspended (the
       pause, or before the first press), an effect would go off late, all
       at once, the moment the clock started again. */
    function sfx() {
        if (!ctx || muted || ctx.state !== "running") return -1;
        return ctx.currentTime + 0.01;
    }
    /* The same, but at most once every `gap` seconds per effect, for the
       ones called many times a second (climbing, pushing) and the jingles,
       which would only pile up on top of each other. */
    const lastAt = {};
    function gate(name, gap) {
        const at = sfx();
        if (at < 0) return -1;
        const was = lastAt[name];
        if (was != null && at >= was && at - was < gap) return -1;
        lastAt[name] = at;
        return at;
    }
    function safe(fn) {
        return function () {
            try { fn.apply(null, arguments); } catch (e) { /* a sound effect is never worth an error */ }
        };
    }

    // C minor pentatonic, upward: each coin in a chain a step higher. A
    // short FM blip and a bright bell a fourth above it.
    const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
    let lastCoin = -1;
    function coin(n) {
        const at = sfx();
        if (at < 0 || at - lastCoin < 0.035) return;
        lastCoin = at;
        const i = Math.min(PENTA.length - 1, Math.max(0, (Math.floor(n) || 1) - 1));
        const note = 79 + PENTA[i];
        fm(at, 0.05, hz(note), { vol: 0.16, ratio: 2, index: 1.5, indexTo: 0.5, indexTime: 0.05, sustain: 0.6 });
        fm(at + 0.05, 0.28, hz(note + 5), { vol: 0.2, ratio: 3.5, index: 3, indexTo: 0.1, indexTime: 0.2, ring: true });
    }

    // A brass stab on the chord, and a bell over it.
    function combo() {
        const at = sfx();
        if (at < 0) return;
        [72, 75, 79].forEach(n => stab(at, hz(n), 0.12));
        [79, 84].forEach((n, i) => bell(at + 0.12 + i * 0.07, 0.5, hz(n + 7), 0.16));
    }

    // The coin flood: a brass fanfare up C major (the light breaking in),
    // a held chord, bells on top and a shimmer of noise.
    function flood() {
        const at = sfx();
        if (at < 0) return;
        [60, 64, 67, 72, 76, 79].forEach((n, i) => brass(at + i * 0.06, 0.1, hz(n), 0.15));
        [72, 76, 79].forEach(n => brass(at + 0.38, 0.7, hz(n), 0.11));
        [84, 88, 91, 96].forEach((n, i) => bell(at + 0.42 + i * 0.09, 0.6, hz(n), 0.14));
        bass(at + 0.38, 0.6, hz(36));
        drop(at + 0.38, 0.2, 160, 40, 1, 0.05);
        hiss(at + 0.4, 0.8, 0.12, 6000);
    }

    function floodEnd() {
        const at = sfx();
        if (at < 0) return;
        [96, 91, 87, 84, 79].forEach((n, i) => bell(at + i * 0.07, 0.3, hz(n), 0.1));
        brass(at + 0.38, 0.4, hz(72), 0.12);
    }

    /* Under the water: an FM gurgle dropping away (a modulator at half the
       pitch, wobbling hard), a rush of filtered noise and three bubbles,
       and the whole track pulled under for a moment (the lowpass dropped to
       420Hz and let back up). */
    function splash() {
        const at = sfx();
        if (at < 0) return;
        fm(at, 0.45, 640, { vol: 0.5, ratio: 0.5, index: 4, indexTo: 1, indexTime: 0.4, to: 90, sustain: 0.8, decay: 0.2 });
        hiss(at, 0.45, 0.4, 900, "lowpass");
        [0.12, 0.22, 0.36].forEach((d, i) => fm(at + d, 0.07, 280 + i * 90, { vol: 0.22, ratio: 1, index: 0.5, to: 820 + i * 140, sustain: 0.8 }));
        const t = ctx.currentTime;
        lowpass.frequency.cancelScheduledValues(t);
        lowpass.frequency.setValueAtTime(Math.max(UNDER_HZ, Math.min(lowpass.frequency.value || OPEN_HZ, OPEN_HZ)), t);
        lowpass.frequency.exponentialRampToValueAtTime(UNDER_HZ, t + 0.12);
        lowpass.frequency.setTargetAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, t + 0.9, 0.15);
    }

    function respawn() {
        const at = sfx();
        if (at < 0) return;
        fm(at, 0.4, hz(48), { vol: 0.35, ratio: 1, index: 2, indexTo: 0.5, to: hz(72), sustain: 0.8 });
        bell(at + 0.3, 0.4, hz(79), 0.2);
        bell(at + 0.42, 0.5, hz(84), 0.18);
    }

    // Phew: a quick up-and-over, two notes and a ring.
    function closeCall() {
        const at = sfx();
        if (at < 0) return;
        brass(at, 0.05, hz(83), 0.14);
        brass(at + 0.06, 0.05, hz(86), 0.14);
        bell(at + 0.12, 0.3, hz(84), 0.18);
    }

    /* A new zone: a four-note call in that zone's colour, and the band
       moves over to it (setZone). */
    const ZONE_CALL = {
        1: { notes: [67, 72, 74, 79], voice: "brass" },
        2: { notes: [55, 60, 62, 67], voice: "brass" },
        3: { notes: [84, 87, 91, 96], voice: "tine" },
        4: { notes: [60, 63, 66, 67], voice: "bell" },
        5: { notes: [65, 68, 72, 77], voice: "brass" },
        6: { notes: [72, 76, 79, 84], voice: "brass" }
    };
    function zoneJingle(n) {
        setZone(n);
        const at = sfx();
        if (at < 0) return;
        const c = ZONE_CALL[zoneOf(n)];
        c.notes.forEach((m, i) => {
            const t = at + i * 0.11, end = i === 3;
            if (c.voice === "brass") brass(t, end ? 0.5 : 0.1, hz(m), 0.16);
            else if (c.voice === "tine") { tine(t, hz(m), 0.12); bell(t, end ? 0.8 : 0.3, hz(m - 12), 0.12); }
            else bell(t, end ? 0.9 : 0.35, hz(m), 0.18);
        });
        bass(at, 0.5, hz(c.notes[0] - 24));
    }

    // A quick brass run up the chord, over the top of the tune.
    function levelUp() {
        const at = sfx();
        if (at < 0) return;
        [72, 75, 79, 84, 87].forEach((n, i) => brass(at + i * 0.07, 0.08, hz(n), 0.15));
        brass(at + 0.35, 0.4, hz(91), 0.15);
        bell(at + 0.35, 0.5, hz(91), 0.1);
    }

    /* "glass": time slowing — a pitch sinking in wobbly steps through a
       slow, watery FM wobble. "heart": a warm electric-piano arpeggio
       rising, a brass note on top. */
    function powerUp(kind) {
        const at = sfx();
        if (at < 0) return;
        if (kind === "heart") {
            [60, 64, 67, 72, 76].forEach((n, i) => piano(at + i * 0.07, 0.4, hz(n), 0.25));
            brass(at + 0.35, 0.5, hz(79), 0.14);
            bell(at + 0.35, 0.7, hz(84), 0.14);
            return;
        }
        const o = ctx.createOscillator();
        o.type = "sine";
        for (let i = 0; i <= 12; i++) o.frequency.setValueAtTime(1300 * Math.pow(0.88, i) * (i % 2 ? 1.07 : 1), at + i * 0.05);
        const m = ctx.createOscillator();
        m.type = "sine";
        m.frequency.setValueAtTime(7, at);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(40, at);
        m.connect(mg); mg.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35, at);
        g.gain.linearRampToValueAtTime(0, at + 0.7);
        o.connect(g); g.connect(dest || master); g.connect(wetBus);
        o.start(at); m.start(at); o.stop(at + 0.72); m.stop(at + 0.72);
        bell(at, 0.6, hz(96), 0.1);
    }

    function best() {
        const at = sfx();
        if (at < 0) return;
        bell(at, 0.2, hz(79), 0.2);
        bell(at + 0.1, 0.2, hz(79), 0.2);
        bell(at + 0.2, 0.3, hz(84), 0.22);
        brass(at + 0.32, 0.45, hz(88), 0.15);
    }

    /* A footstep: the faintest tick of noise, at most one every 0.1s, and
       only while the tune is playing. */
    let lastStep = -1;
    function footstep() {
        const at = sfx();
        if (at < 0 || !playing || sad || at - lastStep < 0.1) return;
        lastStep = at;
        hiss(at, 0.02, 0.05, 3000);
    }

    /* ---- the platformer's effects (12 Oct 2026: Rat Race became a room-
       by-room platform game — Scout, four zones of three acts, a key to
       find and an exit door in each). All FM, all short; the ones the game
       calls several times a second are gated (see gate), and quiet. */

    // A jump: an FM "boing" sliding up a fifth. The wall jump: higher,
    // quicker, with a little spring on top.
    function jump() {
        const at = gate("jump", 0.05);
        if (at < 0) return;
        fm(at, 0.14, hz(62), { vol: 0.17, ratio: 1, index: 2, indexTo: 0.5, indexTime: 0.12, to: hz(69), sustain: 0.7, decay: 0.1, release: 0.02 });
    }
    function wallJump() {
        const at = gate("jump", 0.05);
        if (at < 0) return;
        fm(at, 0.11, hz(67), { vol: 0.17, ratio: 1, index: 2.4, indexTo: 0.5, indexTime: 0.1, to: hz(79), sustain: 0.7, decay: 0.1, release: 0.015 });
        fm(at + 0.07, 0.06, hz(86), { vol: 0.07, ratio: 2, index: 1.2, indexTo: 0.3, sustain: 0.6, release: 0.01 });
    }
    // Landing: a short thud, and a puff of low noise. Soft: half as loud.
    function land(soft) {
        const at = gate("land", 0.06);
        if (at < 0) return;
        const v = soft ? 0.5 : 1;
        drop(at, 0.09, 120, 50, 0.5 * v, 0.03);
        hiss(at, 0.035, 0.1 * v, 500, "lowpass");
    }
    // A ladder rung: a tiny wooden knock, alternating two pitches.
    let rung = 0;
    function climb() {
        const at = gate("climb", 0.1);
        if (at < 0) return;
        rung = 1 - rung;
        hiss(at, 0.018, 0.05, rung ? 1800 : 1500, "bandpass", 3);
        fm(at, 0.03, hz(rung ? 79 : 76), { vol: 0.025, ratio: 3.5, index: 1, indexTo: 0.1, ring: true });
    }
    // Crawling: a soft shuffle of band-passed noise.
    function crawl() {
        const at = gate("crawl", 0.15);
        if (at < 0) return;
        hiss(at, 0.06, 0.035, 800, "bandpass", 1);
    }
    // Pushing a crate: a wooden scrape — a narrow band of noise and a low,
    // gritty FM grind (an inharmonic ratio, so it doesn't sound like a note).
    function push() {
        const at = gate("push", 0.12);
        if (at < 0) return;
        hiss(at, 0.1, 0.1, 350 + Math.random() * 80, "bandpass", 4);
        fm(at, 0.08, 45, { vol: 0.06, ratio: 1.41, index: 4, indexTo: 2, sustain: 0.8, release: 0.02 });
    }

    // A gem: brighter and longer than a coin — a bell arpeggio and a tine.
    /* THE GHOST (17 Oct 2026): the epic Mine's lead, played here: two FM voices spread wide and a few cents
       apart, the index low (near a flute), a vibrato blooming as the note is held, breath on it, a whisper
       an octave above; into its bus (its echoes and the cavern). */
    // (whisper: the breath and the octave above brought forward, the voice itself drawn back)
    function ghostNote(at, dur, f, vol, whisper) {
        const kV = whisper ? 0.6 : 1, kW = whisper ? 0.24 : 0.12, kB = whisper ? 0.14 : 0.05;
        const end = at + dur + 1.2;
        const pan = (v) => { if (typeof ctx.createStereoPanner !== "function") return ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
        for (const [c, pv, k] of [[-7, -0.42, 0.55], [7, 0.42, 0.52]]) {
            const fr = f * Math.pow(2, c / 1200), car = ctx.createOscillator(), mod = ctx.createOscillator(), ig = ctx.createGain();
            car.frequency.value = fr; mod.frequency.value = fr;
            ig.gain.setValueAtTime(fr * 0.3, at); ig.gain.linearRampToValueAtTime(fr * 0.95, at + 0.22); ig.gain.setTargetAtTime(fr * 0.7, at + 0.3, 0.6);
            mod.connect(ig); ig.connect(car.frequency);
            const vo = ctx.createOscillator(), vg = ctx.createGain(); vo.frequency.value = 5.1; vg.gain.setValueAtTime(0, at); vg.gain.setValueAtTime(0, at + 0.28); vg.gain.linearRampToValueAtTime(dur > 0.5 ? 16 : 6, at + Math.max(0.3, Math.min(dur, 1.4)));
            vo.connect(vg); vg.connect(car.detune); vg.connect(mod.detune);
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
            const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol * k * kV, at + 0.06); g.gain.setValueAtTime(vol * k * kV, at + dur); g.gain.setTargetAtTime(0, at + dur, 0.18);
            const p = pan(pv); car.connect(lp); lp.connect(g); g.connect(p); p.connect(ghostBus);
            for (const o of [car, mod, vo]) { o.start(at); o.stop(end); }
        }
        const w = ctx.createOscillator(), wg = ctx.createGain(); w.frequency.value = f * 2; w.detune.value = 3;
        wg.gain.setValueAtTime(0, at); wg.gain.linearRampToValueAtTime(vol * kW, at + 0.35); wg.gain.setValueAtTime(vol * kW, at + Math.max(0.35, dur)); wg.gain.setTargetAtTime(0, at + Math.max(0.35, dur), 0.3);
        w.connect(wg); wg.connect(ghostBus); w.start(at); w.stop(end);
        if (noise) {
            const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noise; n.loop = true;
            bp.type = "bandpass"; bp.frequency.value = f * 2.2; bp.Q.value = 4;
            ng.gain.setValueAtTime(0, at); ng.gain.linearRampToValueAtTime(vol * kB, at + 0.05); ng.gain.setValueAtTime(vol * kB, at + dur); ng.gain.setTargetAtTime(0, at + dur, 0.1);
            n.connect(bp); bp.connect(ng); ng.connect(ghostBus); n.start(at); n.stop(end);
        }
    }
    /* Its phrases in the zone's own key, from the Mine's motif (G, Eb, F#, G in C minor); a major zone's
       with its third raised (E for Eb): [semitones from C minor's G5, major?] */
    const GHOST_KEY = { 1: [0], 2: [2], 3: [4], 4: [-3], 5: [5], 6: [0, true], 7: [2, true], 8: [4], 9: [2], 10: [-3], 11: [6] };
    const MOTIF = [[0, 0.22], [-4, 0.3], [-1, 0.12], [0, 0.85]];   // G Eb F# G: semitones from G, seconds
    const FRAGMENTS = [
        [[0, 0.5], [-4, 0.7], [-1, 0.25], [0, 1.4]],               // the motif, slow
        [[1, 0.6], [-2, 0.9], [-7, 1.3]],                          // Ab, F, C: its second bar
        [[1, 0.55], [-2, 0.55], [-5, 0.55], [-8, 1.5]],            // Ab F D B: falling
        [[-7, 0.9], [-5, 0.5], [0, 1.6]]                           // C, D, G: rising, unresolved
    ];
    function ghostPhrase(at, notes, vol, whisper) {
        const [tr, major] = GHOST_KEY[zoneOf(zone)] || [0];
        let t = at;
        for (const [n, d] of notes) { const st = major && n === -4 ? -3 : n; ghostNote(t, d * 0.92, hz(79 + tr + st), vol, whisper); t += d; }
    }
    // A ruby (17 Oct 2026, the owner's: "when you pick up a rubie a few notes of the lead could play"): the motif's opening on the ghost.
    function gem() {
        const at = gate("gem", 0.3);
        if (at < 0) return;
        ghostPhrase(at, MOTIF, 0.32);
    }
    /* How haunted (0 to 1): Scout in a dark area (rat-race.js says, outside the Depths). (17 Oct 2026, the
       owner's, on the first try, which sent the whole tune into a cavern: "it sounds like two massively echoy
       tracks overlapping ... Completely lower the volume of the main soundtrack, and have ghostly whispers of
       the lead.") The tune all but gone (its own bus, the sound effects untouched), and above a half the ghost
       whispering fragments of the motif every few seconds. */
    function haunt(h) {
        h = Math.max(0, Math.min(1, Number(h) || 0));
        if (!ctx || !musicBus) { hauntLevel = h; return; }
        const t = ctx.currentTime;
        musicBus.gain.setTargetAtTime(1, t, 0.45);
        hauntLevel = h;
    }

    /* An extra life: a jingle of its own, about a second and a half — up a
       C major arpeggio on the brass, a skip back, and a held top C, with
       the bass under it. */
    function oneUp() {
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        [[0, 67, 0.09], [0.1, 72, 0.09], [0.2, 76, 0.09], [0.3, 79, 0.12], [0.45, 76, 0.09], [0.55, 79, 0.09], [0.7, 84, 0.7]]
            .forEach(([t, n, d]) => brass(at + t, d, hz(n), 0.15));
        [[0, 48], [0.3, 55], [0.7, 60]].forEach(([t, n]) => bass(at + t, 0.25, hz(n), false, 0.45));
        bell(at + 0.7, 0.8, hz(91), 0.1);
    }

    // The key: a magical climb up a whole-tone scale, bells and tines, and
    // a shimmer.
    function key() {
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        [72, 74, 76, 78, 80, 82, 84].forEach((n, i) => bell(at + i * 0.05, 0.45, hz(n), 0.12));
        [96, 100].forEach((n, i) => tine(at + 0.35 + i * 0.06, hz(n), 0.1));
        hiss(at + 0.3, 0.5, 0.05, 7000);
    }
    // The exit unlocking: a heavy clunk (a thud, a metallic FM clank), then
    // a two-note chime.
    function unlock() {
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        drop(at, 0.16, 180, 55, 0.8, 0.03);
        hiss(at, 0.08, 0.2, 1200, "lowpass");
        fm(at + 0.01, 0.07, 220, { vol: 0.15, ratio: 1.41, index: 6, indexTo: 1, sustain: 0.5, release: 0.01 });
        bell(at + 0.2, 0.6, hz(84), 0.15);
        bell(at + 0.3, 0.8, hz(91), 0.13);
    }
    // Through the door: a whoosh and a rising note.
    function door() {
        const at = gate("door", 0.3);
        if (at < 0) return;
        hiss(at, 0.35, 0.14, 600, "bandpass", 1.5);
        fm(at, 0.3, hz(48), { vol: 0.25, ratio: 1, index: 1.5, indexTo: 0.4, to: hz(60), sustain: 0.8, release: 0.04 });
        bell(at + 0.2, 0.5, hz(79), 0.1);
    }

    // Bouncing on an enemy: a punchy thump and a springy boing up.
    // DYNAMITE (13 Oct 2026): the fuse, a dry crackle every so often while it burns...
    function fuse() {
        const at = gate("fuse", 0.06);
        if (at < 0) return;
        hiss(at, 0.05, 0.18, 5200);
        hiss(at + 0.03, 0.03, 0.12, 7000);
    }
    // ...and the blast: a deep thump falling away under a long roar of noise, and the rubble rattling down after it.
    function boom() {
        const at = gate("boom", 0.3);
        if (at < 0) return;
        drop(at, 0.9, 110, 28, 1.2, 0.5);
        drop(at, 0.25, 600, 80, 0.6, 0.12);
        hiss(at, 1.1, 0.9, 120, "lowpass");
        hiss(at, 0.5, 0.5, 900, "bandpass", 0.8);
        for (let i = 0; i < 6; i++) hiss(at + 0.25 + i * 0.09 + Math.random() * 0.05, 0.06, 0.25 - i * 0.03, 2400, "bandpass", 1.5);
    }
    function stomp() {
        const at = gate("stomp", 0.05);
        if (at < 0) return;
        drop(at, 0.08, 300, 110, 0.55, 0.03);
        fm(at + 0.02, 0.1, hz(72), { vol: 0.15, ratio: 1, index: 2, indexTo: 0.4, to: hz(84), sustain: 0.7, release: 0.015 });
    }
    // Scout hit: an FM "ouch" falling away (an inharmonic ratio for the
    // rasp) and a burst of noise.
    function hurt() {
        const at = gate("hurt", 0.2);
        if (at < 0) return;
        fm(at, 0.3, hz(76), { vol: 0.22, ratio: 1.5, index: 5, indexTo: 1.5, indexTime: 0.25, to: hz(52), sustain: 0.8, decay: 0.15, release: 0.02 });
        hiss(at, 0.12, 0.18, 1500);
    }

    /* A life lost: the tune holds for a moment (no new notes until `hold`
       runs out, then in again at the top of a bar) while a jingle of about
       a second and a half plays — four notes sliding down a semitone at a
       time on the brass, then a fall through the C minor chord. */
    let holdUntil = 0;
    function hold(sec) {
        if (!ctx) return;
        holdUntil = ctx.currentTime + sec;
        step = Math.ceil(step / STEPS) * STEPS;
    }
    function lifeLost() {
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        if (playing && !sad) hold(1.8);
        [79, 78, 77, 76].forEach((n, i) => brass(at + i * 0.13, 0.11, hz(n), 0.15));
        [[0.62, 72, 0.25], [0.92, 67, 0.22], [1.2, 60, 0.4]].forEach(([t, n, d]) => brass(at + t, d, hz(n), 0.15));
        fm(at + 1.2, 0.35, hz(48), { vol: 0.4, ratio: 1, index: 2, indexTo: 0.5, to: hz(36), sustain: 0.8, release: 0.05 });
        drop(at + 1.2, 0.2, 160, 40, 0.8, 0.05);
    }

    /* A secret room: a four-note discovery motif of its own — A, E, G#,
       B, up and opening out (a major seventh, bright and a little
       strange), bells doubled by quiet brass, and a ring on top. */
    function secret() {
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        [69, 76, 80, 83].forEach((n, i) => {
            const end = i === 3;
            bell(at + i * 0.13, end ? 1 : 0.4, hz(n + 12), 0.15);
            brass(at + i * 0.13, end ? 0.5 : 0.11, hz(n), 0.08);
        });
        tine(at + 0.52, hz(100), 0.08);
    }

    // A checkpoint: one soft bell and a fainter one above.
    function checkpoint() {
        const at = gate("checkpoint", 0.3);
        if (at < 0) return;
        bell(at, 0.9, hz(84), 0.13);
        bell(at + 0.08, 0.9, hz(91), 0.07);
    }

    /* The act cleared: the tune stops (the game starts it again for the
       next act) and a fanfare of about three seconds plays — a rising
       sequence in C minor on brass over the kick, a snare roll, and a
       crash onto a held C major chord, the light at the end. */
    function actClear() {
        stop();
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        [[0, 67, 0.11], [0.13, 67, 0.11], [0.26, 72, 0.25], [0.55, 70, 0.11], [0.68, 72, 0.11], [0.81, 75, 0.25],
            [1.1, 74, 0.11], [1.23, 75, 0.11], [1.36, 77, 0.3]].forEach(([t, n, d]) => brass(at + t, d, hz(n), 0.16));
        [72, 76, 79].forEach(n => brass(at + 1.75, 1.1, hz(n), 0.12));
        bell(at + 1.75, 1.2, hz(84), 0.12);
        [[0, 36], [0.26, 43], [0.55, 34], [0.81, 39], [1.1, 38], [1.36, 41]].forEach(([t, n]) => bass(at + t, 0.2, hz(n), false, 0.5));
        bass(at + 1.75, 1, hz(36), false, 0.55);
        [0, 0.26, 0.55, 0.81, 1.1, 1.36, 1.75].forEach(t => kick(at + t, 0.9));
        for (let i = 0; i < 6; i++) snare(at + 1.5 + i * 0.042, 0.3 + i * 0.1);
        crash(at + 1.75, 0.15);
    }

    /* The title card sliding in: a whoosh, then a kick, a crash and a
       brass stab on the zone's own chord with a bell over it. */
    const CARD_SHIFT = { 1: 0, 2: 2, 3: 4, 4: -3, 5: 5, 6: 0 };
    function titleCard() {
        const at = gate("jingle", 0.3);
        if (at < 0) return;
        const k = CARD_SHIFT[zoneOf(zone)];
        hiss(at, 0.25, 0.08, 1500, "bandpass", 1);
        const hit = at + 0.22;
        kick(hit, 1);
        crash(hit, 0.12);
        [60, 63, 67].forEach(n => stab(hit, hz(n + k), 0.1));
        brass(hit, 0.45, hz(72 + k), 0.14);
        bell(hit + 0.05, 0.8, hz(84 + k), 0.1);
    }

    // Pausing: two quick blips. (Call before pause() and after resume():
    // the clock doesn't run in between.)
    function pauseBlip() {
        const at = gate("blip", 0.05);
        if (at < 0) return;
        fm(at, 0.04, hz(84), { vol: 0.12, ratio: 2, index: 1.2, indexTo: 0.4, sustain: 0.7, release: 0.01 });
        fm(at + 0.05, 0.05, hz(91), { vol: 0.12, ratio: 2, index: 1.2, indexTo: 0.4, sustain: 0.7, release: 0.01 });
    }

    /* The song stops, a slow fall plays out on the bells, and then the
       lament starts from the top and goes round until the screen changes
       (start() brings the real tune back). Muted, the lament still keeps
       time, silently, so unmuting on this screen brings it in. */
    function gameOver() {
        stop();
        if (!setup()) return;
        wake();
        const at = ctx.currentTime + 0.05;
        if (!muted) {
            [84, 79, 75, 72, 67, 63, 60].forEach((n, i) => bell(at + i * 0.15, 0.35, hz(n), 0.2));
            fm(at + 1.05, 0.8, hz(48), { vol: 0.45, ratio: 1, index: 3, indexTo: 0.3, indexTime: 0.5, to: hz(36), sustain: 0.8, decay: 0.3 });
        }
        sad = true;
        muffled = false;
        step = 0;
        resetCounts();
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(loudness(), t);
        lowpass.frequency.cancelScheduledValues(t);
        lowpass.frequency.setValueAtTime(OPEN_HZ, t);
        lowpass.frequency.setValueAtTime(SAD_HZ, at + 1.7);
        colour(t);
        nextAt = at + 2;
        holdUntil = 0;
        run();
    }

    // A swift diving: air rushing past, falling in pitch.
    function whoosh() { const at = gate("whoosh", 0.3); if (at < 0) return; hiss(at, 0.35, 0.12, 1800, "bandpass", 3); fm(at, 0.3, 900, { vol: 0.04, ratio: 0.5, index: 2, to: 300, sustain: 0.6 }); }
    // A ledge giving way: a crack and grit.
    function crumble() { const at = gate("crumble", 0.12); if (at < 0) return; hiss(at, 0.12, 0.3, 1200, "bandpass", 1.5); drop(at, 0.1, 300, 90, 0.4, 0.05); }
    // A blast door's wheel turning a notch: a heavy ratchet click, rising as it goes.
    let wheelN = 0;
    function wheel(k) { const at = gate("wheel", 0.04); if (at < 0) return; wheelN++; drop(at, 0.06, 220 + (k || 0) * 120, 120, 0.5, 0.02); hiss(at, 0.03, 0.25, 2600, "bandpass", 4); }
    // A blast door opening: a deep clang and a hiss of air.
    function clang() { const at = sfx(); if (at < 0) return; fm(at, 1.2, 70, { vol: 0.5, ratio: 1.41, index: 4, indexTo: 0.2, indexTime: 0.8, ring: true, wet: true }); hiss(at + 0.1, 0.9, 0.2, 800, "lowpass"); }
    // A bubble rising.
    /* WATER (13 Oct 2026, the owner's: the stroke "sounds more like a
       firing noise rather than an in water jump"). No pitched sweeps: a
       stroke is a soft low push of water and two tiny bubbles popping; a
       splash (in, or out onto the side) a burst of broken water, spray, and
       droplets falling back. */
    const pop = (at, f, vol) => fm(at, 0.03, f, { vol, ratio: 1, index: 0.05, to: f * 1.5, sustain: 0.5, decay: 0.01, release: 0.01, cut: 2400 });
    function bubble() {
        const at = gate("bubble", 0.08); if (at < 0) return;
        hiss(at, 0.22, 0.16, 600, "lowpass");
        hiss(at, 0.12, 0.05, 1400, "bandpass", 1.5);
        pop(at + 0.04 + Math.random() * 0.03, 650 + Math.random() * 250, 0.05);
        pop(at + 0.1 + Math.random() * 0.04, 850 + Math.random() * 300, 0.035);
    }
    // THE TIDE's horn: a ship's, low, two notes, far off down the decks
    function tideHorn() {
        const at = sfx(); if (at < 0) return;
        for (const [d, f] of [[0, 73.4], [0.9, 65.4]]) {
            fm(at + d, 0.8, f, { vol: 0.2, ratio: 1, index: 2.2, indexTo: 1.6, attack: 0.08, sustain: 0.9, decay: 0.3, release: 0.25, cut: 700, wet: true });
            fm(at + d, 0.8, f * 1.5, { vol: 0.08, ratio: 1, index: 1.4, attack: 0.1, sustain: 0.9, decay: 0.3, release: 0.25, cut: 900, wet: true });
        }
    }
    // A PUMP draining the sea (14 Oct 2026): a long low gurgle going down, with glugs
    function drain() {
        const at = sfx(); if (at < 0) return;
        const s2 = ctx.createBufferSource(); s2.buffer = noise;
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 3;
        f.frequency.setValueAtTime(900, at); f.frequency.exponentialRampToValueAtTime(160, at + 2.6);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.001, at); g2.gain.exponentialRampToValueAtTime(0.16, at + 0.3); g2.gain.exponentialRampToValueAtTime(0.001, at + 2.8);
        s2.connect(f); f.connect(g2); g2.connect(dest || master); s2.start(at, Math.random() * 0.5); s2.stop(at + 2.9);
        for (let i = 0; i < 9; i++) pop(at + 0.2 + i * 0.27 + Math.random() * 0.08, 420 - i * 28 + Math.random() * 60, 0.05);
    }
    /* WATER LET OUT (21 Oct 2026): called every frame with how hard it is flowing (0 to 1). A rush of water while
       it pours (a roar at the burst, low and wide), easing to a thinner gurgle as it slows, glugs in it now and
       then, and gone when it stops. One voice, kept running while there is flow, faded out after. */
    let rushV = null, rushLvl = 0;
    function rush(level) {
        level = Math.max(0, Math.min(1, level || 0));
        const at = sfx();
        if (at < 0) { if (rushV) { try { rushV.s.stop(); } catch (e) { } rushV = null; } return; }
        if (level < 0.01 && !rushV) return;
        if (!rushV) {
            const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
            const lo = ctx.createBiquadFilter(); lo.type = "lowpass"; lo.Q.value = 0.7;
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.9;
            const gl = ctx.createGain(), gb = ctx.createGain(), out = ctx.createGain();
            gl.gain.value = 0; gb.gain.value = 0; out.gain.value = 1;
            s.connect(lo); lo.connect(gl); gl.connect(out);
            s.connect(bp); bp.connect(gb); gb.connect(out);
            out.connect(dest || master); s.start(at, Math.random());
            rushV = { s, lo, bp, gl, gb, quiet: 0 };
        }
        const v = rushV;
        /* the body: louder and wider with the flow; the hiss of spray over it. (Set only when the flow has changed by
           a step, the old settings cleared first: set every frame, the settings piled up in the audio by the
           thousand, and the game lagged while water ran.) */
        v.n = (v.n || 0) + 1;
        if (Math.abs(level - (v.set == null ? -1 : v.set)) > 0.03 || (level < 0.01 && v.set > 0) || v.n % 20 === 0) {
            const up = level > (v.set || 0);
            v.set = level;
            for (const p of [v.gl.gain, v.lo.frequency, v.gb.gain, v.bp.frequency]) { p.cancelScheduledValues(at); p.setValueAtTime(p.value, at); }
            v.gl.gain.setTargetAtTime(0.2 * Math.pow(level, 0.8), at, up ? 0.04 : 0.25);
            v.lo.frequency.setTargetAtTime(260 + 1100 * level, at, 0.2);
            v.gb.gain.setTargetAtTime(0.05 * level + (level > 0.02 ? 0.012 : 0), at, 0.2);
            v.bp.frequency.setTargetAtTime(1400 + 1800 * level, at, 0.2);
        }
        // glugs: more as it thins to a gurgle
        if (level > 0.02 && Math.random() < 0.02 + 0.05 * (1 - level)) pop(at + Math.random() * 0.05, 220 + Math.random() * 380 * (1.2 - level), 0.03 + 0.04 * (1 - level));
        rushLvl = level;
        if (level < 0.01) { if (++v.quiet > 90) { try { v.s.stop(at + 0.1); } catch (e) { } rushV = null; } } else v.quiet = 0;
    }
    // THE NEW ZONES' SOUNDS (14 Oct 2026): the vault's tick, a piston's punch, thunder, a puff of sand
    // (named apart from the scheduler's tick(), 14 Oct 2026: under the same name it took the scheduler's place, so every zone played this click every 25ms and no music)
    function vaultTick(n) { const at = gate("tick", 0.05); if (at < 0) return; block(at, n === 0, n === 0 ? 0.05 : 0.03); }
    function piston() { const at = gate("piston", 0.1); if (at < 0) return; hiss(at, 0.08, 0.18, 1600, "bandpass", 1.2); drop(at + 0.03, 0.12, 180, 60, 0.45, 0.04); fm(at + 0.03, 0.2, 330, { vol: 0.05, ratio: 2.76, index: 2, indexTo: 0.1, indexTime: 0.1, ring: true }); }
    function thunder() {
        const at = sfx(); if (at < 0) return;
        const s2 = ctx.createBufferSource(); s2.buffer = noise;
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(600, at); f.frequency.exponentialRampToValueAtTime(90, at + 2.4);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.001, at); g2.gain.exponentialRampToValueAtTime(0.3, at + 0.08); g2.gain.exponentialRampToValueAtTime(0.001, at + 2.6);
        s2.connect(f); f.connect(g2); g2.connect(dest || master); s2.start(at); s2.stop(at + 2.7);
    }
    function sandPuff(big) { const at = gate("sandPuff", 0.08); if (at < 0) return; hiss(at, big ? 0.3 : 0.16, big ? 0.16 : 0.09, 900, "lowpass"); hiss(at, 0.1, 0.04, 2400, "bandpass", 1); }
    // AIR running out: a bell, rung once, twice, three times as it goes (the Labyrinth's warning)
    function airBell(n) {
        const at = sfx(); if (at < 0) return;
        for (let i = 0; i < (n || 1); i++) bell(at + i * 0.16, 0.6, 1568, 0.14);
    }
    // a breath from an oxygen tank: a soft rush of air rising
    function gulp() {
        const at = gate("gulp", 0.5); if (at < 0) return;
        const s = ctx.createBufferSource(); s.buffer = noise;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2;
        f.frequency.setValueAtTime(500, at); f.frequency.exponentialRampToValueAtTime(1600, at + 0.35);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.001, at); g2.gain.exponentialRampToValueAtTime(0.12, at + 0.12); g2.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
        s.connect(f); f.connect(g2); g2.connect(dest || master); s.start(at, Math.random() * 0.5); s.stop(at + 0.45);
        pop(at + 0.3, 700, 0.04);
    }
    // A STEAM VALVE: a thin hiss rising as a warning, then the burst, a roar of broad hiss that thins away
    function steamWarn() {
        const at = gate("steamWarn", 0.3); if (at < 0) return;
        const s = ctx.createBufferSource(); s.buffer = noise;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 6;
        f.frequency.setValueAtTime(2500, at); f.frequency.exponentialRampToValueAtTime(6000, at + 0.6);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.001, at); g2.gain.exponentialRampToValueAtTime(0.07, at + 0.55); g2.gain.exponentialRampToValueAtTime(0.001, at + 0.65);
        s.connect(f); f.connect(g2); g2.connect(dest || master); s.start(at, Math.random() * 0.5); s.stop(at + 0.7);
    }
    // (14 Oct 2026) the arcade's: a pinball bumper struck (a bright two-note ding on a thump), a spring pad (a boing, rising)
    function bumperDing() { const at = gate("bumper", 0.05); if (at < 0) return; drop(at, 0.09, 240, 110, 0.3); fm(at, 0.22, 988, { vol: 0.09, ratio: 2.01, index: 2.4, indexTo: 0.2, indexTime: 0.1, ring: true }); fm(at + 0.05, 0.3, 1319, { vol: 0.07, ratio: 2.01, index: 2, indexTo: 0.2, indexTime: 0.12, ring: true, wet: true }); }
    function springBoing() { const at = gate("spring", 0.1); if (at < 0) return; drop(at, 0.34, 150, 620, 0.32, 0.2); fm(at, 0.3, 300, { vol: 0.05, ratio: 1, index: 1.2, indexTo: 0.3, indexTime: 0.2, vib: 0.06 }); }
    /* (14 Oct 2026) A drop of goo landing: a wet "bloop", a pitch falling fast, and a soft slap of low noise; into a pool,
       deeper and with a bubble after. A drop of molten metal (not slime): a short sizzle. A fire jet bursting: a soft
       whoosh, low noise opening and closing, much quieter than the steam valves. */
    function goo(intoPool) {
        const at = gate("goo", 0.12); if (at < 0) return;
        drop(at, 0.16, intoPool ? 420 : 560, intoPool ? 120 : 170, 0.22, 0.09);
        hiss(at, 0.09, 0.05, 700, "lowpass");
        if (intoPool) drop(at + 0.11, 0.08, 300, 520, 0.08, 0.05);
    }
    function sizzle() { const at = gate("sizzle", 0.15); if (at < 0) return; hiss(at, 0.3, 0.06, 4200, "bandpass", 1.2); }
    function flame() {
        const at = gate("flame", 0.25); if (at < 0) return;
        hiss(at, 0.45, 0.07, 650, "lowpass"); hiss(at + 0.03, 0.3, 0.035, 1500, "bandpass", 0.7);
    }
    function steam() {
        const at = gate("steam", 0.3); if (at < 0) return;
        hiss(at, 0.7, 0.22, 3000);
        hiss(at, 0.5, 0.18, 1200, "bandpass", 0.8);
        hiss(at, 0.15, 0.2, 400, "lowpass");
    }
    function waterSplash(big) {
        const at = gate("waterSplash", 0.15); if (at < 0) return;
        const v = big ? 1 : 0.7;
        hiss(at, 0.3, 0.32 * v, 1600, "lowpass");
        hiss(at, 0.12, 0.12 * v, 4000);
        hiss(at + 0.02, 0.5, 0.1 * v, 700, "lowpass");
        for (let i = 0; i < 5; i++) pop(at + 0.12 + Math.random() * 0.35, 900 + Math.random() * 900, 0.025 * v);
    }
    // The station's alarm: two tones, low and lower.
    function alarmTone() { const at = gate("alarm", 0.9); if (at < 0) return; fm(at, 0.3, hz(74), { vol: 0.08, ratio: 2, index: 1.5, sustain: 0.8, release: 0.03 }); fm(at + 0.35, 0.3, hz(70), { vol: 0.08, ratio: 2, index: 1.5, sustain: 0.8, release: 0.03 }); }

    window.RatMusic = {
        start: safe(start), stop: safe(stop), pause: safe(pause), resume: safe(resume),
        setMuffled: safe(setMuffled), setLevel: safe(setLevel), setZone: safe(setZone),
        danger: safe(setDanger), levelUp: safe(levelUp), zone: safe(zoneJingle),
        gameOver: safe(gameOver), setMuted: safe(setMuted), isMuted: () => muted,
        coin: safe(coin), combo: safe(combo), haunt: safe(haunt), flood: safe(flood), floodEnd: safe(floodEnd),
        splash: safe(splash), respawn: safe(respawn), closeCall: safe(closeCall),
        powerUp: safe(powerUp), best: safe(best), step: safe(footstep),
        jump: safe(jump), wallJump: safe(wallJump), land: safe(land), climb: safe(climb),
        crawl: safe(crawl), push: safe(push), gem: safe(gem), oneUp: safe(oneUp),
        key: safe(key), unlock: safe(unlock), door: safe(door), stomp: safe(stomp), fuse: safe(fuse), boom: safe(boom),
        hurt: safe(hurt), lifeLost: safe(lifeLost), secret: safe(secret),
        checkpoint: safe(checkpoint), actClear: safe(actClear), titleCard: safe(titleCard),
        pauseBlip: safe(pauseBlip), whoosh: safe(whoosh), crumble: safe(crumble), splashIn: safe(splash), wheel: safe(wheel), clang: safe(clang), bubble: safe(bubble), waterSplash: safe(waterSplash), steam: safe(steam), goo: safe(goo), sizzle: safe(sizzle), flame: safe(flame), steamWarn: safe(steamWarn), tideHorn: safe(tideHorn), drain: safe(drain), rush: safe(rush), tick: safe(vaultTick), bumper: safe(bumperDing), spring: safe(springBoing), piston: safe(piston), thunder: safe(thunder), sandPuff: safe(sandPuff), airBell: safe(airBell), gulp: safe(gulp), alarmTone: safe(alarmTone),
        // the secret mixer (see THE DEV MIXER; kept for players to find, 13 Oct 2026, the owner's)
        mix: name => { if (!(name in MIX)) return Object.assign({}, MIX); MIX[name] = !MIX[name]; if (ctx) colour(ctx.currentTime); return Object.assign({}, MIX); },
        mixState: () => Object.assign({}, MIX),
        get muted() { return muted; },
        get playing() { return playing; },
        get sad() { return sad; }
    };
    // For testing on the dev server only: how the audio clock is getting on.
    if (typeof location !== "undefined" && location.hostname === "localhost") {
        window.RatMusic._state = () => ({
            ctx: ctx && ctx.state, time: ctx && ctx.currentTime, step, nextAt, playing, muffled, sad,
            level, zone, danger, section, holdUntil, bpm: Math.round(bpm() * 10) / 10, counts: Object.assign({}, counts),
            cutoff: lowpass && Math.round(lowpass.frequency.value), shade: shade && Math.round(shade.frequency.value),
            gain: master && +master.gain.value.toFixed(3)
        });
        // (17 Oct 2026) the ghost and the haunting unwrapped, to see them fail
        window.RatMusic._ghost = { gem, haunt, phrase: (i) => ghostPhrase(ctx.currentTime + 0.05, FRAGMENTS[i || 0], 0.2), get level() { return hauntLevel; }, get send() { return hauntSend && hauntSend.gain.value; }, get music() { return musicBus && musicBus.gain.value; }, get strip() { return strip; } };
        // (21 Oct 2026) book a stretch of the tune at once, sections and all, to see every part of it run
        window.RatMusic._book = (from, n) => { const t = ctx.currentTime + 0.05; for (let i = 0; i < n; i++) book(t + i * 0.002, from + i); return Object.assign({}, counts); };
        window.RatMusic._tune = { A_LEAD, A_CHORDS, B_LEAD, B_BELL, B_COUNTER, B_CHORDS, C_LEAD, C_CHORDS, GROOVES };
    }
})();

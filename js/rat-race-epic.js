/* THE MINE LABYRINTH, EPIC (17 Oct 2026, the owner's: "a second version
   that is big epic cinematic version of the track; don't apply it to any
   level but make it available to listen to in the editor. Make sure the
   score has depth, the best quality, and good variety of peaks and troughs
   throughout"; then "make all 3 versions", "play once with an ending, but
   loop when listening in the browser", "broad and slower").

   The Mine's own tune (rat-race-music.js: the bell motif, the hook, the
   breakdown), rescored as one through-composed piece of 74 bars at 92 a
   minute, about three and a quarter minutes, with an ending (and since 19
   Oct 2026 four bars before its bar 0, the descent rising out of nothing:
   78 in all, about three and a half minutes):

      -4  THE DESCENT (12)   a low C drone, a distant choir, the horns' call
                             (C, G, C, once), the motif's first
                             two bars alone, timpani stirring; a cymbal swell
       8  THE MOTIF (8)      the bell motif whole over a harp (or pulse)
                             ostinato, the strings rising in under it
      16  FIRST BUILD (4)    low strings driving on a G pedal, the brass
                             climbing its diminished line, timpani rolling,
                             the cymbal swelling into
      20  THE HOOK (16)      the hook on full brass, the countermelody in the
                             cellos and trombones, the bells answering; the
                             choir and trumpets join for the higher half
      36  BREAKDOWN (8)      all of it gone at once: the motif on one voice
                             over soft strings, a far-off heartbeat
      44  SECOND BUILD (8)   the ostinato back, quickening; the hook's first
                             bars thrown between low brass and horns; up a
                             tone, onto A, a snare and timpani roll, a riser,
                             a breath of silence, and
      52  THE CLIMAX (16)    the hook a tone higher, in D minor, with
                             everything: trumpets and horns in octaves, the
                             choir on the tune, strings in tremolo
      68  THE ENDING (6)     tutti hits, a long held D minor, and the motif
                             once more, softly, as it dies away

   Three orchestrations of the same score:
       hybrid       the Mine's own FM horns and marimba at the heart of it,
                    wrapped in the orchestra
       orchestral   strings, brass, woodwinds, harp, celesta, piano, choir,
                    timpani, taiko, cymbals
       trailer      the orchestra with synth pulses, braams, risers, sub
                    booms and ticking

   THE HYBRID, FINE-TUNED (17 Oct 2026, the owner's: "Hybrid is the best one
   ... slightly more modern and less stuck in the 80s; that lead flute type
   sound is amazing but ... make it more haunting, so it'll make the hairs on
   the back of your neck stand up ... hauntingly eerie, yet epic and
   cinematic ... the snares [with] some nice reverb on them for that epic slow
   beat ... it still feels somewhat flat overall, see if you can address why").
   Why it was flat: each section the same from its first bar to its last (the
   hook's and the climax's sixteen bars the same drums, the same fullness);
   one depth (the same hall on everything, quiet or loud); one spectrum (no
   deep sub in the peaks, no air taken out of the troughs); and no space
   (pads and choir under nearly every bar, so nothing to hit against). Now:
       THE GHOST   the Mine's FM horn (the "flute"), two voices spread wide,
                   gliding from note to note, a vibrato that blooms as a
                   note is held, breath on it, a whisper an octave above,
                   echoes thrown left and right, and a cathedral round it
       THE EERIE   bowed glass (inharmonic partials, slowly beating), wind,
                   the choir in close dissonant clusters, a low piano tolling,
                   swells drawn backwards into the downbeats, a heartbeat
       MODERN      a sub under the peaks only; a felt piano with the marimba
                   (softer) on the motif; less of the old brass under the tune
       THE SNARE   a big cinematic snare on the slow half-time beat, into a
                   long bright plate of its own (BIG, the third pair of stems)
       THE SHAPE   the hook in three stages (the slow beat alone, the groove,
                   then everything); the climax falling away to the ghost and
                   the choir for two bars and slamming back bigger; a breath of
                   silence before the hook; and the depth moving with it: the
                   quiet parts further off and duller, the big ones close and
                   open (the dry level and a master filter following the shape).

   Every sound made here, from oscillators and noise, and played into an
   OfflineAudioContext once: a hall's reverb from a made impulse, a gentle
   bus compressor and a limiter, the whole normalised. The editor's jukebox
   plays the result round and round.

   A REAL ORCHESTRA (18 Oct 2026, the owner's: "are we able to make it proper
   professional quality, and sound as if it's being played be an actual real
   orchestra?"): when the editor has them, the strings, brass, timpani, harp,
   snare, cymbals, gong and bass drum are recordings of real players (VSCO 2
   Community Edition, public domain; tools/ariadne-editor/orchestra.js makes
   the editor's copy), the same score played on them: THE ORCHESTRA,
   RECORDED, in score(). Each version can still be heard as it was, its
   orchestra made ("-made" in its id). And the Mine's opening has a horn
   call (the owner's: "a signature note pattern from the lead of the track
   should be played by a french horn"). */
(function () {
    "use strict";
    const SR = 44100, TAIL = 5;
    // the song being made: its tempo, its length in bars and its shape (useSong; the Mine's to begin with)
    let BPM = 92, STEP = 15 / BPM, BAR = STEP * 16, BARS = 78;
    /* (19 Oct 2026, the owner's: "the intro should be more progressive and drawn out") the Mine's score begins
       before its bar 0: four bars of it rising out of nothing, its bars -4 to 0. OFF is how many bars into the
       piece the score's bar 0 falls (0 for the other songs); the bars the score is written in stay as they were. */
    let OFF = 4;

    // ---- notes: a bar of sixteen steps, a note, "-" to hold, "." a rest (as the game's music writes them)
    const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
    const midi = n => { const m = /^([A-G][#b]?)(\d)$/.exec(n || ""); return m ? 12 * (Number(m[2]) + 1) + NOTE[m[1]] : null; };
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    function parse(bar) {
        const t = bar.trim().split(/\s+/), out = [];
        for (let i = 0; i < 16; i++) { const m = midi(t[i]); if (m === null) continue; let len = 1; while (i + len < 16 && t[i + len] === "-") len++; out.push({ s: i, m, len }); }
        return out;
    }

    // ---- the Mine's tune
    const A_LEAD = [
        "G5 . . . Eb5 . . . . . F#5 . G5 . . .", "Ab5 . . . F5 . . . . . . . C5 . . .",
        "Ab5 . . . F5 . . . D5 . . . B4 . . .", "C5 . . . . . . . F5 . . . Eb5 . . .",
        "G5 . . . Eb5 . . . . . F#5 . G5 . . .", "A5 . . . F#5 . . . . . Eb5 . C5 . . .",
        "C5 . . . . . D5 . . . . . G5 . . .", "B4 . . . . . . . . . . . . . . ."
    ];
    const A_CHORDS = ["Cm", "Db", "Bdim7", "Csus Cm", "Ab", "F#dim7", "Gsus", "G"];
    const B_LEAD = [
        "C5 - - G5 - - C6 - . Bb5 - G5 . F5 - G5", "A5 - - - F5 - C5 - . . . . . . . .",
        "C5 - - Ab5 - - C6 - . Bb5 - Ab5 . G5 - Ab5", "Bb5 - - - F5 - D5 - . . . . . . . .",
        "C5 - - G5 - - C6 - . D6 - Eb6 . D6 - C6", "A5 - - - C6 - F6 - . . . . Eb6 - D6 -",
        "C6 - - Ab5 - - Eb5 - D5 - - F5 - - Bb5 -", "B5 - - - G5 - - - D5 - G5 - B5 - D6 -",
        "Eb6 - - C6 - - Ab5 - . Bb5 - C6 . Eb6 - F6", "D6 - - - Bb5 - F5 - . . . . . . . .",
        "Eb6 - - Bb5 - - G5 - . Ab5 - Bb5 . C6 - D6", "Eb6 - - - C6 - G5 - . . . . . . . .",
        "F6 - - C6 - - Ab5 - . C6 - F6 . Eb6 - D6", "D6 - - - B5 - G5 - . . . . G5 - B5 -",
        "C6 - - Ab5 - - Eb5 - F5 - - Ab5 - - D6 -", "G5 - - - - - - - D5 - G5 - B5 - D6 -"
    ];
    const B_BELL = [
        "", ". . . . . . . . . . C6 . A5 . F5 .", "", ". . . . . . . . . . D6 . F6 . Bb5 .", "", ". . . . . . . . A5 . C6 . . . . .", "", "",
        "", ". . . . . . . . . . F6 . D6 . Bb5 .", "", ". . . . . . . . . . G6 . Eb6 . C6 .", "", "", "", ""
    ];
    const B_COUNTER = [
        "", "", "", "", "Eb4 - - - - - - - G4 - - - - - - -", "C5 - - - - - - - A4 - - - - - - -", "Ab4 - - - - - - - Bb4 - - - - - - -", "B4 - - - - - - - D5 - - - - - - -",
        "", "", "", "", "F4 - - - - - - - Ab4 - - - - - - -", "G4 - - - - - - - B4 - - - - - - -", "Ab4 - - - - - - - Bb4 - - - - - - -", "B4 - - - - - - - D5 - - - - - - -"
    ];
    const B_CHORDS = ["Cm", "F", "Ab", "Bb", "Cm", "F", "Ab Bb", "G", "Ab", "Bb", "Eb", "Cm", "Fm", "G", "Ab Bb", "G"];
    const C_LEAD = ["G5 . . . . . . . F#5 . . . . . . .", "Eb5 . . . . . . . D5 . . . . . . .", "G4 - D5 - G4 - D5 - A4 - Eb5 - A4 - Eb5 -", "B4 - F5 - B4 - F5 - D5 - Ab5 - B5 - D6 -"];
    const CHORDS = {
        Cm: { root: 36, tones: [60, 63, 67], top: 10 }, Csus: { root: 36, tones: [60, 65, 67], top: 10 }, Db: { root: 37, tones: [61, 65, 68], top: 11 },
        Bdim7: { root: 47, tones: [59, 62, 65, 68], top: 9 }, "F#dim7": { root: 42, tones: [57, 60, 63, 66], top: 9 }, F: { root: 41, tones: [60, 65, 69], top: 10 },
        Gsus: { root: 43, tones: [60, 62, 67], top: 10 }, G: { root: 43, tones: [62, 67, 71], top: 10 }, Ab: { root: 44, tones: [60, 63, 68], top: 11 },
        Bb: { root: 46, tones: [62, 65, 70], top: 10 }, Eb: { root: 39, tones: [63, 67, 70], top: 10 }, Fm: { root: 41, tones: [60, 65, 68], top: 10 },
        // (17 Oct 2026) for the Depths and the Steamworks
        Am: { root: 45, tones: [57, 60, 64], top: 10 }, E: { root: 40, tones: [56, 59, 64], top: 10 }, Dm: { root: 38, tones: [57, 62, 65], top: 10 },
        C: { root: 36, tones: [60, 64, 67], top: 10 }, A: { root: 45, tones: [57, 61, 64], top: 10 }, Gm: { root: 43, tones: [58, 62, 67], top: 10 }
    };
    /* THE DEPTHS' TUNE and THE STEAMWORKS' (rat-race-music.js, zones 4 and 9), for their epic versions */
    const DK = {
        A_CHORDS: ["Am", "Bb", "Am", "E", "Am", "Bb", "F E", "E"],
        A_LEAD: ["A4 . . C5 . . Bb4 . . . . . E4 . . .", "F4 . . A4 . . Bb4 . . . D5 . . . . .", "A4 . . C5 . . Bb4 . . . . . A4 . . .", "G#4 . . . B4 . . . E5 . . . . . . .",
            "A4 . . C5 . . Bb4 . . . . . E4 . . .", "F4 . . A4 . . Bb4 . . . F5 . E5 . D5 .", "C5 . . A4 . . F4 . G#4 . . . B4 . . .", "E5 . . . . . . . . . . . . . . ."],
        B_CHORDS: ["Am", "F", "G", "E", "Am", "F", "Dm E", "Am"],
        B_LEAD: ["E5 - - - F5 - E5 - D5 - C5 - . . B4 -", "C5 - - - - - A4 - . . . . . . . .", "D5 - - - E5 - D5 - C5 - B4 - . . G4 -", "G#4 - - - - - - - B4 - - - E5 - - -",
            "E5 - - - F5 - E5 - D5 - C5 - . . E5 -", "A5 - - - - - G5 - F5 - E5 - . . . .", "F5 - - - E5 - D5 - E5 - - - G#5 - . .", "A5 - - - - - - - . . . . . . . ."],
        B_ANSWER: ["", ". . . . . . . . . . A5 . . . E5 .", "", "", "", ". . . . . . . . . . . . A4 . C5 .", "", ""],
        B_COUNTER: ["", "", "", "", "C4 - - - - - - - - - - - - - - -", "A3 - - - - - - - - - - - - - - -", "A3 - - - - - - - G#3 - - - - - - -", "A3 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Am", "Bb", "E", "E"],
        C_LEAD: ["A5 . . . . . . . Bb5 . . . . . . .", "A5 . . . . . . . G#5 . . . . . . .", "E4 - B4 - E4 - B4 - G#4 - D5 - G#4 - D5 -", "B4 - E5 - B4 - E5 - G#5 - B5 - E5 - G#5 -"]
    };
    const SW = {
        A_CHORDS: ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Gm", "A"],
        A_LEAD: ["D4 . . . . . . . A4 . . . . . . .", "F4 . . . . . . . E4 . . . D4 . . .", "D4 . . . . . . . F4 . . . . . . .", "E4 . . . . . . . G4 . . . . . . .",
            "D4 . . . . . . . A4 . . . . . . .", "C5 . . . . . . . A4 . . . F4 . . .", "G4 . . . . . . . Bb4 . . . D5 . . .", "C#5 . . . . . . . E5 . . . A4 . . ."],
        B_CHORDS: ["F", "C", "Dm", "Bb", "F", "C", "Bb C", "F"],
        B_LEAD: ["C5 - - - F5 - - - A5 - - - - - G5 -", "G5 - - - - - - - E5 - - - C5 - - -", "D5 - - - F5 - - - A5 - - - D6 - - -", "C6 - - - - - - - Bb5 - - - A5 - G5 -",
            "C5 - - - F5 - - - A5 - - - C6 - - -", "E6 - - - - - - - D6 - - - C6 - - -", "D6 - - - C6 - - - Bb5 - - - G5 - - -", "F5 - - - - - - - - - - - . . . ."],
        B_ANSWER: ["", ". . . . . . . . . . . . C6 . E6 .", "", ". . . . . . . . . . . . F6 . D6 .", "", ". . . . . . . . . . . . G6 . E6 .", "", ". . . . . . . . A5 . C6 . F6 . A6 ."],
        B_COUNTER: ["A4 - - - - - - - - - - - - - - -", "G4 - - - - - - - - - - - - - - -", "F4 - - - - - - - - - - - - - - -", "F4 - - - - - - - - - - - - - - -", "A4 - - - - - - - - - - - - - - -", "G4 - - - - - - - - - - - - - - -", "F4 - - - - - - - G4 - - - - - - -", "A4 - - - - - - - - - - - - - - -"],
        C_CHORDS: ["Dm", "Bb", "C", "A"],
        C_LEAD: ["D5 - - D5 - - F5 - A5 - - - G5 - F5 -", "Bb5 - - Bb5 - - A5 - G5 - - - F5 - D5 -", "C6 - - C6 - - Bb5 - A5 - - - G5 - E5 -", "A5 - - - C#6 - - - E6 - - - A6 - - -"]
    };
    const chord = (name, tr) => { const c = CHORDS[name]; return { root: c.root + (tr || 0), tones: c.tones.map(x => x + (tr || 0)), top: c.top }; };
    // a bar's chords: one, or two a half-bar each
    const halves = (str, tr) => { const p = str.split(" "); return p.length === 1 ? [[0, 16, chord(p[0], tr)]] : [[0, 8, chord(p[0], tr)], [8, 8, chord(p[1], tr)]]; };
    const GROOVE = ["R - O R . x R O . R O . R x O 5", "R . O R . R O . R . O R x 5 O 7"];

    // How full the music is, bar by bar (0 to 1): its peaks and troughs.
    let SHAPE;
    const MINE_SHAPE = [[-4, 0.06], [-2, 0.12], [0, 0.2], [6, 0.3], [8, 0.34], [16, 0.5], [19.9, 0.66], [20, 0.88], [28, 0.94], [35.9, 0.94], [36, 0.18], [40, 0.24], [44, 0.32], [48, 0.55], [51.9, 0.92], [52, 1], [59.9, 1], [60, 0.5], [61.9, 0.62], [62, 1], [67.9, 1], [68, 1], [70, 0.95], [71.5, 0.45], [74, 0.12]];
    SHAPE = MINE_SHAPE;
    function useSong(bpm, bars, shp, off) { BPM = bpm; STEP = 15 / bpm; BAR = STEP * 16; BARS = bars; SHAPE = shp; OFF = off || 0; }
    // (b in the score's bars; shapeAt(t) for a moment in the piece, in seconds)
    const shapeAt = t => shape(t / BAR - OFF);
    const shape = b => { for (let i = 1; i < SHAPE.length; i++) if (b <= SHAPE[i][0]) { const [b0, v0] = SHAPE[i - 1], [b1, v1] = SHAPE[i]; return v0 + (v1 - v0) * (b - b0) / (b1 - b0); } return SHAPE[SHAPE.length - 1][1]; };

    // A hall: stereo noise dying away over secs, its top dulled as it dies, a soft onset.
    function hall(ctx, secs, dark, room) {
        const n = Math.floor(secs * SR), b = ctx.createBuffer(2, n, SR), dk = dark === undefined ? 0.82 : dark;
        for (let ch = 0; ch < 2; ch++) {
            const d = b.getChannelData(ch); let lp = 0;
            // (room: the tail eased in later, under the reflections, so the two do not pile up at the start)
            for (let i = 0; i < n; i++) { const t = i / n, env = Math.pow(1 - t, 2.6) * Math.min(1, i / (SR * (room ? 0.06 : 0.018))); lp += ((Math.random() * 2 - 1) - lp) * (0.9 - dk * t); d[i] = lp * env; }
            /* (20 Oct 2026) a room's first reflections: the walls, the floor and the ceiling of a concert hall, a few
               dozen clear echoes in its first eighty milliseconds, each side its own, before the made tail takes over
               (a tail alone, with nothing before it, is what a plate or a cheap reverb sounds like) */
            if (room) for (let k = 0; k < 18; k++) {
                const at = Math.floor(SR * (0.007 + 0.075 * Math.pow(Math.random(), 0.8))), a = (0.55 - 0.45 * at / (SR * 0.085)) * (Math.random() < 0.5 ? -1 : 1) * 3;
                for (let j = 0; j < 24 && at + j < n; j++) d[at + j] += a * Math.exp(-j / 6) * (j % 2 ? 0.5 : 1);
            }
        }
        return b;
    }

    /* THE SCORE, for one stretch of it (seg: from a to b, in seconds): only the notes that start in it are made,
       at times counted from its start (gate), and how long the last of them rings is kept (seg.max). Each
       stretch is made on its own and the stretches laid end to end (render): an OfflineAudioContext works
       through every node it holds for every moment of its length, so one context for the whole piece, with
       some twenty thousand nodes, took minutes; a stretch at a time takes seconds. */
    function score(ctx, V, seg, mix, verbIn, bigIn) {
        const at = (bar, step) => (bar + OFF) * BAR + (step || 0) * STEP;
        const R = (a, b) => a + Math.random() * (b - a);
        const gate = (t, end) => { if (!(t >= seg.a && t < seg.b)) return null; if (end - seg.a > seg.max) seg.max = end - seg.a; return t - seg.a; };
        // a section: its level, where it sits, how much hall, and (for some) a shared tone control
        function bus(level, pan, send, lp, big) {
            const g = ctx.createGain(); g.gain.value = level;
            let head = g, filter = null;
            if (lp) { filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = lp; filter.Q.value = 0.5; filter.connect(g); head = filter; }
            const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(mix);
            const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(verbIn);
            if (big) { const b = ctx.createGain(); b.gain.value = big; p.connect(b); b.connect(bigIn); }
            return { in: head, filter, g };
        }
        // the strings' and pulses' tone opening up with the music, half a bar at a time
        const brighten = (f, lo, hi) => { if (V.bank) { lo *= 2.2; hi = Math.min(16000, hi * 2.6); } for (let b = -OFF; b <= BARS - OFF; b += 0.5) { const tt = at(b) - seg.a; if (tt < seg.b - seg.a + 40) f.frequency.setValueAtTime(lo + (hi - lo) * Math.pow(shape(b), 1.3), Math.max(0, tt)); } };
        const vHi = bus(0.05, -0.5, 0.5, 2000), vLo = bus(0.06, 0.42, 0.45, 1400), basses = bus(0.07, 0.22, 0.35, 900), spicc = bus(0.07, -0.25, 0.32, 1800), trem = bus(0.035, -0.6, 0.4, 3000);
        brighten(vHi.filter, 900, 5200); brighten(vLo.filter, 700, 3600); brighten(basses.filter, 350, 1200); brighten(spicc.filter, 700, 3200);
        const horns = bus(0.22, -0.3, 0.5), tpts = bus(0.16, 0.35, 0.42), tbns = bus(0.2, 0.5, 0.4), fmb = bus(0.32, -0.08, 0.38), lead = bus(0.13, 0.1, 0.5, 2600);
        const keys = bus(0.32, 0.45, 0.55), harp = bus(0.3, -0.55, 0.5), piano = bus(0.3, 0.2, 0.5), winds = bus(0.24, -0.4, 0.52);
        const perc = bus(0.85, 0.08, 0.3), timp = bus(0.75, -0.22, 0.38), cym = bus(0.22, 0.35, 0.45), fx = bus(0.55, 0, 0.6), pulse = bus(0.07, 0, 0.25, 900);
        brighten(pulse.filter, 450, 2600);
        // (17 Oct 2026) the haunting and the modern: the snare and its plate, the eerie things, the sub, the felt piano
        const snr = bus(0.62, 0.06, 0.25, null, 0.95), eerie = bus(0.3, 0, 0.7, null, 0.8), subB = bus(0.5, 0, 0.02, 160), felt = bus(0.34, -0.1, 0.55, 1700, 0.25);
        /* THE GHOST's bus: dry a little, then its echoes, a dotted eighth apart, thrown left and right, each
           duller than the last, and much of it into the plate */
        const ghostIn = ctx.createGain(), ghostDry = ctx.createGain(); ghostDry.gain.value = 0.3; ghostIn.connect(ghostDry); ghostDry.connect(mix);
        const gBig = ctx.createGain(); gBig.gain.value = 0.55; ghostIn.connect(gBig); gBig.connect(bigIn);
        const gHall = ctx.createGain(); gHall.gain.value = 0.35; ghostIn.connect(gHall); gHall.connect(verbIn);
        {
            const dL = ctx.createDelay(1), dR = ctx.createDelay(1), fb = ctx.createGain(), lpE = ctx.createBiquadFilter(), pL = ctx.createStereoPanner(), pR = ctx.createStereoPanner(), into = ctx.createGain();
            dL.delayTime.value = STEP * 3; dR.delayTime.value = STEP * 3; fb.gain.value = 0.28; lpE.type = "lowpass"; lpE.frequency.value = 2200; into.gain.value = 0.32;
            pL.pan.value = -0.85; pR.pan.value = 0.85;
            ghostIn.connect(into); into.connect(lpE);
            // (20 Oct 2026) its echoes drawn back as the music fills, for the recorded versions: in the full parts they were one more sustain under everything
            if (V.bank) for (let b = -OFF; b <= BARS - OFF; b += 0.5) { const tt = at(b) - seg.a; if (tt >= -1 && tt < seg.b - seg.a + 40) into.gain.setValueAtTime(0.32 * (1 - 0.55 * shape(b)), Math.max(0, tt)); } lpE.connect(dL); dL.connect(pL); dL.connect(dR); dR.connect(pR); dR.connect(fb); fb.connect(lpE);
            const eo = ctx.createGain(); eo.gain.value = 0.12; pL.connect(eo); pR.connect(eo); eo.connect(mix); const eb = ctx.createGain(); eb.gain.value = 0.15; pL.connect(eb); pR.connect(eb); eb.connect(bigIn);
        }
        const choirIn = {};
        for (const [name, F, pan] of [["ah", [[800, 1], [1150, 0.55], [2900, 0.22]], 0.28], ["oo", [[350, 1], [640, 0.35], [2700, 0.08]], -0.28]]) {
            const out = bus(0.11, pan, 0.75), inp = ctx.createGain();
            for (const [f, k] of F) { const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6; const g = ctx.createGain(); g.gain.value = k * 3; inp.connect(bp); bp.connect(g); g.connect(out.in); }
            choirIn[name] = inp;
        }
        /* a vibrato for one note, living only as long as it does (one shared by every note kept the renderer
           working through thousands of finished connections for the whole piece: minutes, not seconds) */
        const vibOf = (rate, cents) => (t, t1) => { const o = ctx.createOscillator(); o.frequency.value = rate * R(0.94, 1.06); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(cents, t + 0.35); o.connect(g); o.start(t); o.stop(t1); return g; };
        const vibS = vibOf(5.1, 6), vibC = vibOf(4.6, 9), vibW = vibOf(5.4, 11);
        const noise = (() => { const b = ctx.createBuffer(1, SR * 2, SR), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
        const noiseSrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + dur); return s; };
        const osc = (type, f, t, t1, det, vib) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; if (vib) vib.connect(o.detune); o.start(t); o.stop(t1); return o; };
        const envAR = (g, t, a, v, hold, rel) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a, hold)); g.gain.setTargetAtTime(0, t + Math.max(a, hold), rel / 3); };
        const envHit = (g, t, v, dec) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, dec / 4); };

        /* ================================================================ THE ORCHESTRA, RECORDED (18 Oct 2026)
           When the editor has the recordings (V.bank: tools/ariadne-editor/orchestra.js makes them), the
           strings, brass, timpani, harp, snare, cymbals, gong and bass drum are those, and each instrument
           below plays them instead of making its sound: the recording of the nearest note, at the dynamic
           nearest how hard it is played, tuned to the note (it is a few semitones at most); a note held longer
           than the recording goes on in more of it, from past its start, the two crossfaded. Its level is the
           score's, times how loud the instrument's made sound was (CAL: measured, so the balance of the score
           is kept). (19 Oct 2026) And the violas (the middle of the strings), a tuba under the low brass, the
           flute and oboe, and a real piano (the felt piano's notes too, through its dark tone). The choir, the
           ghost, the Mine's own FM and the eerie things stay made. */
        const BANK = V.bank || null;
        const CAL = BANK ? BANK.cal : {};
        // the recording for a note: the nearest at the dynamic wanted, or at any if that one has none near
        function pick(I, m, v) {
            const li = I.layers === 1 ? 0 : I.layers === 2 ? (v < 0.5 ? 0 : 1) : (v < 0.35 ? 0 : v < 0.7 ? 1 : 2);
            const mine = I.notes.filter(e => e.layer === li);
            if (m === null || mine[0].m === undefined) return mine[Math.floor(Math.random() * mine.length)];
            const near = l => l.reduce((a, e) => Math.abs(e.m - m) < Math.abs(a.m - m) ? e : a);
            const e = near(mine), any = near(I.notes);
            return Math.abs(e.m - m) > 4 && Math.abs(any.m - m) < Math.abs(e.m - m) ? any : e;
        }
        // where in a recording to go on from (0.9s to 1.8s in, past its attack) so it matches it at at0: the best correlated
        function splice(e, at0) {
            const d = e.buf.getChannelData(0), N = 2048, lo = Math.round(0.9 * SR), hi = Math.min(Math.round(1.8 * SR), Math.floor(e.len * 0.5 * SR));
            if (hi <= lo || at0 + N > d.length) return lo / SR;
            let best = lo, bestC = -Infinity;
            for (let c = lo; c < hi; c += 3) { let sum = 0, ee = 0; for (let i = 0; i < N; i += 2) { const y = d[c + i]; sum += d[at0 + i] * y; ee += y * y; } const k = sum / Math.sqrt(ee + 1e-12); if (k > bestC) { bestC = k; best = c; } }
            for (let c = best - 3; c <= best + 3; c++) { if (c < lo) continue; let sum = 0, ee = 0; for (let i = 0; i < N; i++) { const y = d[c + i]; sum += d[at0 + i] * y; ee += y * y; } const k = sum / Math.sqrt(ee + 1e-12); if (k > bestC) { bestC = k; best = c; } }
            return best / SR;
        }
        /* play one: o.dest (where), o.dur (held for, or let ring when not given), o.att and o.rel, o.v1 (the level
           moving to, over the note: a roll's), o.offset (from how far in), o.lv (how hard it is struck, when not v), o.e (this recording), o.jit (tuned a hair at random). True if
           the instrument is recorded (whether or not this stretch of the score is the one making it). */
        /* (19 Oct 2026, the owner's: "The whole track doesn't feel like it's as grand or big anymore") A SECTION, NOT
           A PLAYER. The library's brass and its double bass are one player each, and its string sections small: one
           recording to a part is a soloist, however loud. A part is played by o.players of them, each its own
           recording (the nearest notes, both dynamics), each a few cents from the others and a moment later or
           sooner, sat a little apart: a real section's spread of tuning and timing, which is what makes one sound
           big rather than loud. Together they come to the one player's level (power adding, not pressure).
           And how hard a section plays (o.intense): no softer than the music around it is full, so the peaks are
           the loud recordings, brighter and harder, at whatever level the score gives them. */
        function sample(inst, t0, m, v, o) {
            const I = BANK && BANK[inst]; if (!I) return false;
            if (o.intense && !V.calibrating) o = Object.assign({}, o, { lv: Math.max(o.lv === undefined ? v : o.lv, 0.88 * shapeAt(t0)) });
            const n = o.players || 1;
            if (n === 1 || m === null || I.notes[0].m === undefined) { play1(I, inst, t0, m, v, o); return true; }
            const lv = o.lv === undefined ? v : o.lv, want = pick(I, m, lv).layer;
            const near = I.notes.filter(e => Math.abs(e.m - m) <= 5).sort((a, b) => (Math.abs(a.m - m) + (a.layer === want ? 0 : 1.5)) - (Math.abs(b.m - m) + (b.layer === want ? 0 : 1.5)));
            for (let k = 0; k < n; k++) {
                const e = near.length ? near[k % near.length] : pick(I, m, lv), again = near.length && k >= near.length;
                const side = n > 1 ? (k / (n - 1)) * 2 - 1 : 0;
                play1(I, inst, t0 + (k ? R(0.004, 0.032) : 0), m, v, Object.assign({}, o, { e, det: side * 7 + R(-2.5, 2.5), pan: side * 0.32, k: 1 / Math.sqrt(n), offset: (o.offset || 0) + (again ? R(0.02, 0.06) : 0) }));
            }
            return true;
        }
        function play1(I, inst, t0, m, v, o) {
            const e = o.e || pick(I, m, o.lv === undefined ? v : o.lv), rate = (e.m === undefined || m === null ? 1 : Math.pow(2, (m - e.m - (e.cents || 0) / 100 + (o.det || 0) / 100) / 12)) * (o.jit ? R(1 - o.jit, 1 + o.jit) : 1);
            const off0 = o.offset || 0, rel = o.rel || 0.3, att = o.att || 0;
            const ring = (e.len - off0) / rate, end0 = t0 + (o.dur === undefined ? ring : o.dur + rel * 2.5);
            const t = gate(t0, end0); if (t === null) return;
            const c = CAL[inst], cal = Array.isArray(c) ? (c[e.layer] === undefined ? c[c.length - 1] : c[e.layer]) : c || 1, end = t + (end0 - t0), lvl = k => cal * e.norm * (o.k || 1) * k / I.ref[e.layer];
            const g = ctx.createGain();
            if (o.dur === undefined) { g.gain.setValueAtTime(att > 0.01 ? 0 : lvl(v), t); if (att > 0.01) g.gain.linearRampToValueAtTime(lvl(v), t + att); }
            else {
                const hold = t + Math.max(att, o.dur);
                g.gain.setValueAtTime(att > 0.01 ? 0 : lvl(v), t); if (att > 0.01) g.gain.linearRampToValueAtTime(lvl(v), t + att);
                if (o.v1 !== undefined) g.gain.linearRampToValueAtTime(lvl(o.v1), hold); else g.gain.setValueAtTime(lvl(v), hold);
                g.gain.setTargetAtTime(0, hold, rel / 3);
            }
            if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(o.dest); } else g.connect(o.dest);
            // the recording, and more of it while the note outlasts it
            const XF = 0.45, TAILS = Math.min(0.4, e.len * 0.3) / rate;   // the crossfade; the end of each recording, faded when it was made, not used
            let s = t, off = off0, first = true;
            while (s < end - 0.01) {
                const src = ctx.createBufferSource(); src.buffer = e.buf; src.playbackRate.value = rate;
                const use = o.dur === undefined ? ring : (e.len - off) / rate - TAILS, last = o.dur === undefined || s + use >= end || use < XF * 3, stopAt = last ? Math.min(end, s + (e.len - off) / rate) : s + use;
                const sg = ctx.createGain();
                if (!first) { sg.gain.setValueAtTime(0, s); sg.gain.linearRampToValueAtTime(1, s + XF); }
                if (!last) { sg.gain.setValueAtTime(1, stopAt - XF); sg.gain.linearRampToValueAtTime(0, stopAt); }
                src.connect(sg); sg.connect(g); src.start(s, off); src.stop(stopAt + 0.02);
                if (last) break;
                /* the next, from wherever past its start its sound lines up best with the moment it takes over (two
                   copies of a note crossfaded out of step cancel each other: a dip, measured at 8 dB) */
                const at0 = Math.round((off + (stopAt - XF - s) * rate) * SR);
                s = stopAt - XF; off = splice(e, at0); first = false;
                if ((e.len - off) / rate - TAILS < XF * 3) break;   // (a recording too short to go on in)
            }
        }

        // ================================================================ THE INSTRUMENTS
        // a string section's note: four bowed saws, a little apart, the vibrato shared
        // (recorded: the violins, the cellos or the basses, by the section and then the note; one too high or low for any, an octave in)
        const fold = (m, lo, hi) => { while (m > hi) m -= 12; while (m < lo) m += 12; return m; };
        function stringsOf(b, m) {
            let k = b === vHi ? "violins" : b === vLo ? "cellos" : b === basses ? "basses" : m >= 55 ? "violins" : m >= 38 ? "cellos" : "basses";
            if (k === "violins" && m < 53) k = "cellos"; if (k === "cellos" && m < 34) k = "basses"; if (k === "cellos" && m > 81) k = "violins"; if (k === "basses" && m > 62) k = "cellos";
            // (19 Oct 2026) the violas, where a string section's middle is: the high strings' lower notes, the low strings' upper
            if (BANK && BANK.violas && ((k === "violins" && m < 62) || (k === "cellos" && m >= 57 && m <= 76))) k = "violas";
            return [k, fold(m, 24, 89)];
        }
        // how many play a part, section by section (the library's: violins, violas and cellos small sections, the rest one player)
        const PLAYERS = { violins: 3, violas: 2, cellos: 3, basses: 3, violinSpic: 2, celloSpic: 2, horns: 4, trumpets: 3, trombones: 3, tuba: 1 };
        function strings(b, t, dur, m, v, att, rel) { if (seg.log) seg.log.push([t, dur, m, "strings"]);
            att = att || 0.3; rel = rel || 0.9;
            if (BANK) { const [k, mm] = stringsOf(b, m); if (sample(k, t, mm, v, { dest: b.in, dur, att: Math.max(0.03, att * 0.8), rel, players: PLAYERS[k], intense: true })) return; }
            if ((t = gate(t, t + dur + rel * 2)) === null) return;
            const g = ctx.createGain(); envAR(g, t, att, v, dur, rel); g.connect(b.in);
            const vb = dur > 0.4 ? vibS(t, t + dur + rel * 2) : null;
            for (const d of [-11, -4, 4, 11]) osc("sawtooth", hz(m), t, t + dur + rel * 2, d + R(-2, 2), vb).connect(g);
        }
        // a short bowed note, for the driving lines
        function spic(b, t, m, v, len) {
            // (recorded: the violins' or the cellos' spiccato; below the cellos, the basses bowed short)
            if (BANK) {
                const d = Math.max(0.14, len || 0.12), o = { dest: b.in, dur: d, rel: 0.12, jit: 0.002 };
                const k = b === trem ? (m >= 53 ? "violinSpic" : "celloSpic") : m >= 38 ? (m > 79 ? "violinSpic" : "celloSpic") : null;
                if (k ? sample(k, t, fold(m, 36, 89), v, Object.assign(o, { players: PLAYERS[k], intense: true })) : sample("basses", t, fold(m, 24, 60), v, Object.assign(o, { att: 0.012, rel: 0.1, players: 2 }))) return;
            }
            if ((t = gate(t, t + (len || 0.12) + 0.4)) === null) return;
            const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setTargetAtTime(v * 0.35, t + 0.02, 0.05); g.gain.setTargetAtTime(0, t + (len || 0.12), 0.04); g.connect(b.in);
            for (const d of [-7, 6]) osc("sawtooth", hz(m), t, t + (len || 0.12) + 0.4, d).connect(g);
        }
        // brass: three saws through a filter that opens as the note speaks, the pitch scooping up into it
        function brass(b, t, dur, m, v, kind) { if (seg.log) seg.log.push([t, dur, m, "brass"]);
            // (recorded: horns, trumpets, trombones; a note out of the instrument's reach, an octave in, as an orchestrator would)
            if (BANK) {
                const [k, lo, hi] = kind === "tpt" ? ["trumpets", 52, 86] : kind === "horn" ? ["horns", 34, 79] : ["trombones", 33, 70], mm = fold(m, lo, hi);
                if (sample(k, t, mm, v, { dest: b.in, dur, att: kind === "horn" ? 0.03 : 0.015, rel: 0.32, players: PLAYERS[k], intense: true })) {
                    // (19 Oct 2026) the low brass's weight: in the full parts, a tuba an octave under the trombones' low notes
                    if (kind === "tbn" && !V.hybrid && mm < 53 && shapeAt(t) > 0.6) sample("tuba", t, fold(mm - 12, 29, 50), v * 0.75, { dest: b.in, dur, att: 0.02, rel: 0.32, intense: true });
                    return;
                }
            }
            if ((t = gate(t, t + dur + 0.8)) === null) return;
            const top = kind === "tpt" ? 3600 : kind === "horn" ? 1500 : 2000, f = ctx.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 1.1;
            f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(top * (0.55 + 0.6 * v), t + 0.09); f.frequency.setTargetAtTime(top * (0.4 + 0.45 * v), t + 0.1, 0.35); f.frequency.setTargetAtTime(220, t + dur, 0.1);
            const g = ctx.createGain(); envAR(g, t, kind === "horn" ? 0.07 : 0.035, v, dur, 0.25); f.connect(g); g.connect(b.in);
            const vb = dur > 0.4 ? vibS(t, t + dur + 0.8) : null;
            for (const d of [-8, 0, 8]) { const o = osc("sawtooth", hz(m), t, t + dur + 0.8, 0); o.detune.setValueAtTime(d - 28, t); o.detune.linearRampToValueAtTime(d, t + 0.06); if (vb) vb.connect(o.detune); o.connect(f); }
        }
        // the Mine's own horn: two FM operators, the index swelling as the note opens (as rat-race-music.js plays it)
        function fmHorn(t, dur, m, v) { if (seg.log) seg.log.push([t, dur, m, "fmHorn"]);
            if ((t = gate(t, t + dur + 0.6)) === null) return;
            for (const [c, k] of [[-6, 0.55], [6, 0.5]]) {
                const f = hz(m), car = osc("sine", f, t, t + dur + 0.6, c), mod = osc("sine", f, t, t + dur + 0.6, c), ig = ctx.createGain();
                ig.gain.setValueAtTime(f * 0.5, t); ig.gain.linearRampToValueAtTime(f * 1.4, t + 0.16); mod.connect(ig); ig.connect(car.frequency);
                const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1900; const g = ctx.createGain(); envAR(g, t, 0.035, v * k, dur, 0.2);
                car.connect(lp); lp.connect(g); g.connect(fmb.in);
            }
        }
        /* THE GHOST: the Mine's horn made haunting. Two FM voices spread wide and a few cents apart, the index
           lower (purer, nearer a flute); a glide from the last note when it follows on; a vibrato blooming
           as the note is held; breath on it; a whisper an octave above; all into its echoes and the plate. */
        let lastGhost = null;
        function ghost(t0, dur, m, v) {
            if (seg.log) seg.log.push([t0, dur, m, "ghost"]);
            const prev = lastGhost; lastGhost = { m, end: t0 + dur };
            let t = gate(t0, t0 + dur + 5); if (t === null) return;
            const f = hz(m), glide = prev && t0 - prev.end < 0.3 && Math.abs(prev.m - m) <= 4 && prev.m !== m ? hz(prev.m) : null, end = t + dur + 1.2;
            for (const [c, pan, k] of [[-7, -0.42, 0.55], [7, 0.42, 0.52]]) {
                const car = osc("sine", f, t, end, c), mod = osc("sine", f, t, end, c), ig = ctx.createGain();
                if (glide) { car.frequency.setValueAtTime(glide, t); car.frequency.exponentialRampToValueAtTime(f, t + 0.07); mod.frequency.setValueAtTime(glide, t); mod.frequency.exponentialRampToValueAtTime(f, t + 0.07); }
                ig.gain.setValueAtTime(f * 0.3, t); ig.gain.linearRampToValueAtTime(f * 0.95, t + 0.22); ig.gain.setTargetAtTime(f * 0.7, t + 0.3, 0.6); mod.connect(ig); ig.connect(car.frequency);
                // the vibrato: none at first, blooming as the note is held
                const vo = ctx.createOscillator(); vo.frequency.value = 5.1 + R(-0.2, 0.2); const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + 0.28); vg.gain.linearRampToValueAtTime(dur > 0.5 ? 16 : 6, t + Math.max(0.3, Math.min(dur, 1.4))); vo.connect(vg); vg.connect(car.detune); vg.connect(mod.detune); vo.start(t); vo.stop(end);
                const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; const g = ctx.createGain(); envAR(g, t, 0.06, v * k, dur, 0.55);
                const p = ctx.createStereoPanner(); p.pan.value = pan; car.connect(lp); lp.connect(g); g.connect(p); p.connect(ghostIn);
            }
            // a whisper an octave above, slow to come
            const w = osc("sine", f * 2, t, end, 3), wg = ctx.createGain(); envAR(wg, t, 0.35, v * 0.12, dur, 0.9); w.connect(wg); wg.connect(ghostIn);
            // breath
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 2.2; bp.Q.value = 4; const ng = ctx.createGain(); envAR(ng, t, 0.05, v * 0.05, dur, 0.3); noiseSrc(t, dur + 0.8).connect(bp); bp.connect(ng); ng.connect(ghostIn);
        }
        // a big cinematic snare: the crack, the body, a low thump, and much of it to the plate
        function bigSnare(t, v) {
            v *= 0.55 + 0.45 * shapeAt(t);
            if ((t = gate(t, t + 0.8)) === null) return;
            // (recorded: the crack the orchestra's snare, struck hard; the body and the thump under it still made)
            if (!(BANK && sample("snare", t + seg.a, null, v, { dest: snr.in, lv: 1, jit: 0.01 }))) {
                const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1300; const bp = ctx.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 3600; bp.gain.value = 5;
                const g = ctx.createGain(); envHit(g, t, v, 0.32); noiseSrc(t, 0.8).connect(hp); hp.connect(bp); bp.connect(g); g.connect(snr.in);
            }
            const o = osc("triangle", 210, t, t + 0.5, 0); o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(175, t + 0.08); const og = ctx.createGain(); envHit(og, t, v * 0.7, 0.14); o.connect(og); og.connect(snr.in);
            const th = osc("sine", 95, t, t + 0.5, 0); th.frequency.setValueAtTime(120, t); th.frequency.exponentialRampToValueAtTime(70, t + 0.1); const tg = ctx.createGain(); envHit(tg, t, v * 0.6, 0.18); th.connect(tg); tg.connect(snr.in);
        }
        // bowed glass: inharmonic partials, high, swelling slowly and beating against each other
        function glass(t, dur, m, v) { if (seg.log) seg.log.push([t, dur, m, "glass"]);
            if ((t = gate(t, t + dur + 5)) === null) return;
            for (const [r, k, det] of [[1, 1, -4], [1, 0.8, 5], [2.76, 0.35, 0], [5.4, 0.12, 2]]) { const g = ctx.createGain(); envAR(g, t, Math.min(2.5, dur * 0.5), v * k, dur, 3); osc("sine", hz(m) * r, t, t + dur + 5, det).connect(g); g.connect(eerie.in); }
        }
        function glassChords(b0, chords, tr, v, lo) { chords.forEach((str, i) => { for (const [s, len, c] of halves(str, tr)) { const ts = voice(c.tones, lo || 84); glass(at(b0 + i, s), len * STEP, ts[ts.length - 1], v); } }); }
        // wind through the passages: noise through a slowly wandering band (19 Oct 2026: no longer used, the owner hearing it as "odd background noise that sounds a bit like white noise")
        function wind(t, dur, v) {
            if ((t = gate(t, t + dur + 2)) === null) return;
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 3; for (let k = 0; k <= dur; k += 0.7) bp.frequency.setValueAtTime(380 + 900 * (0.5 + 0.5 * Math.sin(k * 0.9 + R(0, 6))), t + k);
            const g = ctx.createGain(); envAR(g, t, Math.min(3, dur * 0.4), v, dur, 2); noiseSrc(t, dur + 2).connect(bp); bp.connect(g); g.connect(eerie.in);
        }
        // a swell drawn backwards: a chord rising out of nothing and cut off on the downbeat it leads to
        function revSwell(tEnd, dur, ms, v) {
            let t = tEnd - dur; if ((t = gate(t, t + dur + 0.1)) === null) return;
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(5000, t + dur);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur - 0.01); g.gain.linearRampToValueAtTime(0, t + dur + 0.01); lp.connect(g); g.connect(eerie.in);
            for (const m of ms) for (const d of [-9, 9]) osc("sawtooth", hz(m), t, t + dur + 0.05, d).connect(lp);
        }
        // the sub: a deep sine under the peaks only
        function sub(t, dur, m, v) { if (seg.log) seg.log.push([t, dur, m, "sub"]); if ((t = gate(t, t + dur + 1)) === null) return; const g = ctx.createGain(); envAR(g, t, 0.08, v, dur, 0.4); osc("sine", hz(m), t, t + dur + 1, 0).connect(g); g.connect(subB.in); }
        // a heartbeat: two soft thumps, low
        function heart(t, v) { for (const [dt, k] of [[0, 1], [0.26, 0.65]]) { let tt = gate(t + dt, t + dt + 1); if (tt === null) continue; const o = osc("sine", 60, tt, tt + 1, 0); o.frequency.setValueAtTime(62, tt); o.frequency.exponentialRampToValueAtTime(38, tt + 0.18); const g = ctx.createGain(); envHit(g, tt, v * k, 0.5); o.connect(g); g.connect(subB.in); } }
        // a felt piano: the hammers wrapped, soft and close, a dark tone
        // (damped when held is given: the key lifted, the note gone in a tenth of a second; a semitone step of the tune
        // was ringing on into the next note, the two together reading as a wrong one)
        /* (19 Oct 2026, the owner's: "Make sure to add some piano :)") recorded: a real upright, softly, through the
           felt piano's own dark tone; its key let go when held is given, as before */
        function feltNote(t, m, v, held) { if (seg.log) seg.log.push([t, held ? held + 0.1 : 1.2, m, "felt"]); if (BANK && sample("piano", t, fold(m, 21, 108), v, held ? { dest: felt.in, dur: held, rel: 0.22 } : { dest: felt.in })) return; if ((t = gate(t, t + 6.4)) === null) return; for (const [r, k, d, det] of [[1, 1, 3.4, -3], [1, 0.7, 3.4, 3], [2, 0.3, 1.4, 0], [3, 0.08, 0.6, 0]]) { const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * k, t + 0.012); g.gain.setTargetAtTime(0, t + 0.012, d / 4); if (held) g.gain.setTargetAtTime(0, t + held, 0.035); osc("sine", hz(m) * r, t, t + d * 2, det).connect(g); g.connect(felt.in); } }
        // a bell tolling low: FM, the ratio a bell's (3.5), dying slowly (the Depths')
        function toll(t, m, v) {
            if (seg.log) seg.log.push([t, 1.5, m, "toll"]);
            if ((t = gate(t, t + 7)) === null) return;
            const f = hz(m), car = osc("sine", f, t, t + 7, 0), mod = osc("sine", f * 3.5, t, t + 7, 0), ig = ctx.createGain();
            ig.gain.setValueAtTime(f * 2.2, t); ig.gain.setTargetAtTime(f * 0.3, t, 1.2); mod.connect(ig); ig.connect(car.frequency);
            const g = ctx.createGain(); envHit(g, t, v, 5.5); car.connect(g); g.connect(eerie.in);
        }
        // the Steamworks': an engine's chug (a thud and a puff), struck metal, a clank, steam let off
        /* the engine (reworked 17 Oct 2026, the owner's: "a constant snare type beat that is awful"; the puff was a
           band of noise at 900Hz, a snare's, on every eighth): a steam engine's, a low piston thud felt more than
           heard and a dark short chuff of steam, filtered down out of the snare's range; on the strong beats
           (strong) a faint hiss of steam above it */
        function chug(t, v, strong) {
            if ((t = gate(t, t + 0.8)) === null) return;
            const o = osc("sine", 52, t, t + 0.5, 0); o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.09); const g = ctx.createGain(); envHit(g, t, v * 0.8, 0.22); o.connect(g); g.connect(perc.in);
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.6; const bp = ctx.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 220; bp.gain.value = 5;
            const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(v * 0.42, t + 0.015); ng.gain.setTargetAtTime(0, t + 0.02, 0.035); noiseSrc(t, 0.3).connect(lp); lp.connect(bp); bp.connect(ng); ng.connect(perc.in);
            if (strong) { const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5200; const hg = ctx.createGain(); hg.gain.setValueAtTime(0, t + 0.02); hg.gain.linearRampToValueAtTime(v * 0.05, t + 0.05); hg.gain.setTargetAtTime(0, t + 0.06, 0.06); noiseSrc(t, 0.4).connect(hp); hp.connect(hg); hg.connect(cym.in); }
        }
        function metal(t, m, v, dec) {
            if ((t = gate(t, t + 2)) === null) return;
            const f = hz(m), car = osc("sine", f, t, t + 2, 0), mod = osc("sine", f * 2.76, t, t + 2, 0), ig = ctx.createGain();
            ig.gain.setValueAtTime(f * 3, t); ig.gain.setTargetAtTime(f * 0.4, t, 0.05); mod.connect(ig); ig.connect(car.frequency);
            const g = ctx.createGain(); envHit(g, t, v, dec || 0.35); car.connect(g); g.connect(cym.in);
        }
        function clank(t, v) {
            if ((t = gate(t, t + 0.6)) === null) return;
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = R(700, 1300); bp.Q.value = 9; const g = ctx.createGain(); envHit(g, t, v, 0.18); noiseSrc(t, 0.4).connect(bp); bp.connect(g); g.connect(perc.in);
            const o = osc("square", R(310, 420), t, t + 0.3, 0), og = ctx.createGain(); envHit(og, t, v * 0.12, 0.08); o.connect(og); og.connect(perc.in);
        }
        function hiss(t, dur, v) {
            if ((t = gate(t, t + dur + 1.5)) === null) return;
            const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2600; const bp = ctx.createBiquadFilter(); bp.type = "peaking"; bp.frequency.value = 6500; bp.gain.value = 6;
            const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setTargetAtTime(v * 0.6, t + 0.05, 0.3); g.gain.setTargetAtTime(0, t + dur, 0.35);
            noiseSrc(t, dur + 1.5).connect(hp); hp.connect(bp); bp.connect(g); g.connect(eerie.in);
        }
        // the Mine's marimba: an FM strike, ringing short
        function marimba(t, m, v) { if (seg.log) seg.log.push([t, 0.4, m, "marimba"]);
            if ((t = gate(t, t + 1)) === null) return;
            const f = hz(m);
            for (const [ratio, idx, k, dec] of [[1, 0.6, 1, 0.5], [4, 1.6, 0.45, 0.08]]) {
                const car = osc("sine", f, t, t + 1, 0), mod = osc("sine", f * ratio, t, t + 1, 0), ig = ctx.createGain();
                ig.gain.setValueAtTime(f * idx, t); ig.gain.setTargetAtTime(f * 0.02, t, 0.04); mod.connect(ig); ig.connect(car.frequency);
                const g = ctx.createGain(); envHit(g, t, v * k, dec); car.connect(g); g.connect(keys.in);
            }
        }
        // a choir: three voices to a note, sung into the vowel's formants
        // (rel: how long it dies away; a choir doubling the tune lets go quickly, or it smears into the next chord)
        function choir(vowel, t, dur, m, v, rel) { if (seg.log) seg.log.push([t, dur + (rel === undefined ? 0.15 : rel / 3), m, "choir"]);
            if ((t = gate(t, t + dur + 3)) === null) return;
            const g = ctx.createGain(); envAR(g, t, rel === undefined ? 0.55 : 0.25, v, dur, rel === undefined ? 0.8 : rel); g.connect(choirIn[vowel]);
            const vb = vibC(t, t + dur + 3);
            for (const d of [-9, 0, 10]) osc("sawtooth", hz(m), t, t + dur + 3, d + R(-3, 3), vb).connect(g);
        }
        // celesta and glockenspiel: struck, the upper partials dying first
        // (recorded, in the orchestral version only: a glockenspiel, the nearest the library has; the hybrid's stays its own soft bell)
        function celesta(t, m, v, held) { if (seg.log) seg.log.push([t, held ? held + 0.1 : 0.6, m, "celesta"]); if (BANK && V.orch && sample("glock", t, fold(m, 77, 98), v, held ? { dest: keys.in, dur: held, rel: 0.25 } : { dest: keys.in })) return; if ((t = gate(t, t + 3)) === null) return; for (const [r, k, d] of [[1, 1, 1.5], [2, 0.22, 0.6], [4, 0.1, 0.22]]) { const g = ctx.createGain(); envHit(g, t, v * k, d); if (held) g.gain.setTargetAtTime(0, t + held, 0.05); osc("sine", hz(m) * r, t, t + d * 2, 0).connect(g); g.connect(keys.in); } }
        function harpNote(t, m, v) { if (BANK && sample("harp", t, fold(m, 31, 86), v, { dest: harp.in, jit: 0.001 })) return; if ((t = gate(t, t + 4.4)) === null) return; for (const [type, r, k, d] of [["triangle", 1, 1, 2.2], ["sine", 2, 0.3, 1.1], ["sine", 3, 0.1, 0.5]]) { const g = ctx.createGain(); envHit(g, t, v * k, d); osc(type, hz(m) * r, t, t + d * 2, 0).connect(g); g.connect(harp.in); } }
        function pianoNote(t, m, v, held) { if (BANK && sample("piano", t, fold(m, 21, 108), v, held ? { dest: piano.in, dur: held, rel: 0.25 } : { dest: piano.in })) return; if ((t = gate(t, t + 6.4)) === null) return; for (const [r, k, d, det] of [[1, 1, 3.2, -2], [1, 0.6, 3.2, 3], [2, 0.42, 1.6, 0], [3, 0.2, 0.9, 0], [4, 0.1, 0.5, 0]]) { const g = ctx.createGain(); envHit(g, t, v * k, d); osc("sine", hz(m) * r, t, t + d * 2, det).connect(g); g.connect(piano.in); } }
        // woodwinds: a flute (breath and a soft tone) and an oboe (a reed through its nasal band)
        function flute(t, dur, m, v) {
            if (BANK && sample("flute", t, fold(m, 60, 98), v, { dest: winds.in, dur, att: 0.04, rel: 0.25 })) return;
            if ((t = gate(t, t + dur + 1)) === null) return;
            const g = ctx.createGain(); envAR(g, t, 0.07, v, dur, 0.25); g.connect(winds.in);
            const vb = vibW(t, t + dur + 1);
            osc("triangle", hz(m), t, t + dur + 1, 0, vb).connect(g);
            const g2 = ctx.createGain(); g2.gain.value = 0.15; g2.connect(g); osc("sine", hz(m) * 2, t, t + dur + 1, 0, vb).connect(g2);
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = hz(m) * 1.5; bp.Q.value = 3; const ng = ctx.createGain(); envAR(ng, t, 0.05, v * 0.12, dur, 0.2); noiseSrc(t, dur + 0.6).connect(bp); bp.connect(ng); ng.connect(winds.in);
        }
        function oboe(t, dur, m, v) {
            if (BANK && sample("oboe", t, fold(m, 58, 91), v, { dest: winds.in, dur, att: 0.03, rel: 0.22 })) return;
            if ((t = gate(t, t + dur + 1)) === null) return;
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1150; bp.Q.value = 1.4;
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
            const g = ctx.createGain(); envAR(g, t, 0.05, v * 1.6, dur, 0.2); bp.connect(lp); lp.connect(g); g.connect(winds.in);
            osc("sawtooth", hz(m), t, t + dur + 1, 0, vibW(t, t + dur + 1)).connect(bp);
        }
        // timpani: a skin's partials, pitched down onto the note as struck, and the thud of the stick
        // (recorded: the nearest of the five drums, retuned; a note below the lowest drum's reach, an octave up)
        function timpani(t, m, v) {
            if (BANK && sample("timpani", t, m < 35 ? m + 12 : m, v, { dest: timp.in, jit: 0.002 })) return;
            if ((t = gate(t, t + 3.8)) === null) return;
            const f = hz(m);
            for (const [r, k, d] of [[1, 1, 1.9], [1.5, 0.45, 1.1], [1.98, 0.28, 0.7], [2.44, 0.14, 0.45]]) {
                const o = osc("sine", f * r * 1.04, t, t + d * 2, 0); o.frequency.setValueAtTime(f * r * 1.04, t); o.frequency.exponentialRampToValueAtTime(f * r, t + 0.07);
                const g = ctx.createGain(); envHit(g, t, v * k, d); o.connect(g); g.connect(timp.in);
            }
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 220; bp.Q.value = 0.9; const ng = ctx.createGain(); envHit(ng, t, v * 0.7, 0.07); noiseSrc(t, 0.3).connect(bp); bp.connect(ng); ng.connect(timp.in);
        }
        // (a roll: each stroke softer than a single blow, as the strokes ring on into one another)
        function timpRoll(t0, t1, m, v0, v1) { if (BANK && sample("timpRoll", t0, m < 35 ? m + 12 : m, v0, { dest: timp.in, dur: t1 - t0, v1, att: 0.04, rel: 0.25 })) return; for (let t = t0; t < t1; t += 0.062) timpani(t + R(0, 0.008), m, 0.38 * (v0 + (v1 - v0) * (t - t0) / (t1 - t0)) * R(0.8, 1)); }
        // the big drums: taiko (deep), and a lower tom
        function taiko(t, v, big) {
            v *= 0.5 + 0.5 * shapeAt(t);
            /* (recorded: the orchestra's bass drum, hit as hard as it is played, over the made drum whole, its swoop,
               thump and click: with the swoop alone under it, 18 Oct, the owner found the whole "much weaker") */
            // (20 Oct 2026: on the big beats only; under every small drum too it was a concert bass drum "knocking constantly")
            if (big && BANK && sample("bassDrum", t, null, Math.min(1, v * 1.15), { dest: perc.in, jit: 0.01 })) v *= 0.85;
            if ((t = gate(t, t + 2.2)) === null) return;
            const o = osc("sine", 92, t, t + 2.2, 0); o.frequency.setValueAtTime(big ? 84 : 86, t); o.frequency.exponentialRampToValueAtTime(big ? 42 : 60, t + (big ? 0.2 : 0.12));   // (the small one bending less: a drum, not a knock, 20 Oct 2026)
            const g = ctx.createGain(); envHit(g, t, v, big ? 1.5 : 0.9); o.connect(g); g.connect(perc.in);
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; const ng = ctx.createGain(); envHit(ng, t, v * 0.9, 0.09); noiseSrc(t, 0.3).connect(lp); lp.connect(ng); ng.connect(perc.in);
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = big ? 1800 : 1100; bp.Q.value = 1.2; const cg = ctx.createGain(); envHit(cg, t, v * (big ? 0.25 : 0.1), 0.025); noiseSrc(t, 0.1).connect(bp); bp.connect(cg); cg.connect(perc.in);
        }
        /* a tom: (20 Oct 2026, the owner's: "Some of the beats just sound like knocking constantly") a bare sine
           swooping from 175 to 105Hz is a woodblock's knock, not a drum's; now a skin: its tone lower and barely
           bending, two of its modes (1 and 1.59) under the stick's slap and the skin's breath, darkened */
        function tom(t, v) {
            v *= 0.5 + 0.5 * shapeAt(t); if ((t = gate(t, t + 1.2)) === null) return;
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 0.4; lp.connect(perc.in);
            for (const [f, k, d] of [[118, 1, 0.55], [188, 0.35, 0.25]]) { const o = osc("sine", f, t, t + 1.2, 0); o.frequency.setValueAtTime(f * 1.12, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); const g = ctx.createGain(); envHit(g, t, v * k * 0.8, d); o.connect(g); g.connect(lp); }
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 0.8; const ng = ctx.createGain(); envHit(ng, t, v * 0.55, 0.12); noiseSrc(t, 0.4).connect(bp); bp.connect(ng); ng.connect(lp);
        }
        function snare(t, v) {
            v *= 0.5 + 0.5 * shapeAt(t);
            if (BANK && sample("snare", t, null, v, { dest: perc.in, jit: 0.01 })) return;
            if ((t = gate(t, t + 0.4)) === null) return;
            const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1700; const g = ctx.createGain(); envHit(g, t, v, 0.14); noiseSrc(t, 0.4).connect(hp); hp.connect(g); g.connect(perc.in);
            const o = osc("triangle", 195, t, t + 0.3, 0); const og = ctx.createGain(); envHit(og, t, v * 0.5, 0.06); o.connect(og); og.connect(perc.in);
        }
        function snareRoll(t0, t1, v0, v1) { if (BANK && sample("snareRoll", t0, null, v0, { dest: perc.in, dur: t1 - t0, v1, att: 0.03, rel: 0.08 })) return; for (let t = t0; t < t1; t += 0.05) snare(t, 0.5 * (v0 + (v1 - v0) * (t - t0) / (t1 - t0)) * R(0.75, 1)); }
        // cymbals: a crash (noise and a metallic shimmer) or a swell rising into a beat
        // (recorded: a suspended cymbal struck, and at the biggest moments a gong under it)
        function crash(t, v) {
            if (BANK && sample("cymbal", t, null, v, { dest: cym.in })) { if (v >= 0.9) sample("gong", t, null, v * 0.7, { dest: cym.in }); return; }
            if ((t = gate(t, t + 4)) === null) return;
            const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200; const g = ctx.createGain(); envHit(g, t, v, 3.2); noiseSrc(t, 4).connect(hp); hp.connect(g); g.connect(cym.in);
            const hp2 = ctx.createBiquadFilter(); hp2.type = "highpass"; hp2.frequency.value = 6000; const g2 = ctx.createGain(); envHit(g2, t, v * 0.18, 1.8); hp2.connect(g2); g2.connect(cym.in);
            for (const f of [3240, 4610, 5390, 6890, 8130]) osc("square", f, t, t + 2.5, 0).connect(hp2);
        }
        /* (recorded: a cymbal rolled into a crescendo, the one of the three whose peak is soonest after dur, lined up
           so its peak is the downbeat and stopped there, as the made one is) */
        function swell(t, dur, v) {
            if (BANK && BANK.cymSwell) {
                const L = BANK.cymSwell.notes, e = L.filter(x => x.peak >= dur).sort((a, b) => a.peak - b.peak)[0] || L.reduce((a, x) => x.peak > a.peak ? x : a);
                const off = Math.max(0, e.peak - dur);
                sample("cymSwell", t + Math.max(0, dur - e.peak), null, v, { e, dest: cym.in, offset: off, dur: Math.min(dur, e.peak) + 0.03, att: off > 0 ? 0.3 : 0, rel: 0.12 });
                return;
            }
            v *= 0.55; if ((t = gate(t, t + dur + 0.1)) === null) return; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3500; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04); noiseSrc(t, dur + 0.1).connect(hp); hp.connect(g); g.connect(cym.in); }
        // the trailer's: a pulse, a braam, a riser, a boom, a tick
        function pulseNote(t, m, v) { if ((t = gate(t, t + 0.4)) === null) return; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.setTargetAtTime(0, t + 0.01, 0.05); g.connect(pulse.in); osc("sawtooth", hz(m), t, t + 0.4, -6).connect(g); osc("square", hz(m), t, t + 0.4, 7).connect(g); }
        const curve = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(2.6 * x); } return c; })();
        function braam(t, dur, m, v) {
            if ((t = gate(t, t + dur + 3)) === null) return;
            const ws = ctx.createWaveShaper(); ws.curve = curve; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2;
            lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(1500, t + 0.45); lp.frequency.exponentialRampToValueAtTime(380, t + dur);
            const g = ctx.createGain(); envAR(g, t, 0.18, v, dur, 1.4); ws.connect(lp); lp.connect(g); g.connect(fx.in);
            for (const [mm, d] of [[m, -14], [m, 13], [m - 12, -6], [m - 12, 8], [m + 7, 0]]) { const o = osc("sawtooth", hz(mm), t, t + dur + 3, d); const og = ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(ws); }
        }
        function riser(t, dur, v) {
            if ((t = gate(t, t + dur + 0.1)) === null) return;
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.8; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05); noiseSrc(t, dur + 0.1).connect(bp); bp.connect(g); g.connect(fx.in);
            const o = osc("sawtooth", 180, t, t + dur + 0.1, 0); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(1400, t + dur); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2000; const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.25, t + dur); og.gain.linearRampToValueAtTime(0, t + dur + 0.05); o.connect(lp); lp.connect(og); og.connect(fx.in);
        }
        function boom(t, v) { if ((t = gate(t, t + 3)) === null) return; const o = osc("sine", 60, t, t + 3, 0); o.frequency.setValueAtTime(64, t); o.frequency.exponentialRampToValueAtTime(27, t + 1.4); const g = ctx.createGain(); envHit(g, t, v, 2.4); o.connect(g); g.connect(fx.in); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260; const ng = ctx.createGain(); envHit(ng, t, v * 0.8, 0.15); noiseSrc(t, 0.4).connect(lp); lp.connect(ng); ng.connect(fx.in); }
        function tick(t, v) { if ((t = gate(t, t + 0.1)) === null) return; const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 6; const g = ctx.createGain(); envHit(g, t, v, 0.03); noiseSrc(t, 0.08).connect(bp); bp.connect(g); g.connect(fx.in); }

        // ================================================================ HELPERS FOR THE SCORE
        const toBar = (t, want) => Math.min(want, BAR - ((t + 1e-6) % BAR) + 0.02);
        const voice = (tones, lo) => tones.map(x => { let y = x; while (y < lo) y += 12; while (y >= lo + 12) y -= 12; return y; }).sort((a, b) => a - b);
        // the sustained harmony of a bar: high strings (and choir), low strings, the basses
        function pads(bar, str, tr, opt) {
            const o = opt || {}, d = shape(bar + 0.5), K = o.k || 1;
            for (const [s, len, c] of halves(str, tr)) {
                const t = at(bar, s), dur = len * STEP;
                if (o.hi !== false) for (const m of voice(c.tones, o.hiLo || 60)) strings(vHi, t, dur, m, K * (0.1 + 0.26 * d), o.att, o.rel);
                if (o.mid) for (const m of voice(c.tones, 52)) strings(vLo, t, dur, m, K * (0.08 + 0.24 * d), o.att, o.rel);
                if (o.lo !== false) { strings(vLo, t, dur, c.root + 12, K * (0.12 + 0.28 * d), o.att, o.rel); strings(basses, t, dur, c.root, K * (0.16 + 0.32 * d), o.att, o.rel); }
                if (o.choir) for (const m of voice(c.tones, o.choir === "ah" ? 60 : 55)) choir(o.choir, t, dur, m, K * ((o.choirV || 0.2) + 0.22 * d));
            }
        }
        // a line (bars of the tune) played by fn(t, dur, m, v), from bar b0, transposed
        function line(bars, b0, tr, fn, vel, from, to) {
            for (let i = from || 0; i < (to === undefined ? bars.length : to); i++) { if (!bars[i]) continue; for (const n of parse(bars[i])) fn(at(b0 + i - (from || 0), n.s), n.len * STEP, n.m + (tr || 0), vel(b0 + i - (from || 0), n)); }
        }
        // an arpeggio of the bar's chord, a note each eighth (or sixteenth): up and back
        function arp(bar, str, tr, fn, v, sixteenths, lo) {
            const PAT = [0, 1, 2, 3, 4, 3, 2, 1];
            for (const [s, len, c] of halves(str, tr)) {
                const ts = voice(c.tones, lo || 55), up = ts.concat(ts.map(x => x + 12)).slice(0, 5), every = sixteenths ? 1 : 2;
                for (let k = 0; k < len; k += every) fn(at(bar, s + k), up[PAT[(k / every) % 8] % up.length], v * (k % 4 === 0 ? 1 : 0.8));
            }
        }
        // the bass line in the low strings, after the game's grooves
        function groove(bar, str, tr, v, pat) {
            const P = pat.trim().split(/\s+/);
            for (const [s, len, c] of halves(str, tr)) for (let k = s; k < s + len; k++) {
                const ch = P[k]; if (!ch || ch === "." || ch === "-") continue;
                const m = ch === "R" ? c.root : ch === "O" ? c.root + 12 : ch === "5" ? c.root + 7 : ch === "7" ? c.root + c.top : c.root;
                spic(spicc, at(bar, k), m, ch === "x" ? v * 0.35 : v * (k % 4 === 0 ? 1 : 0.82), STEP * (P[k + 1] === "-" ? 1.8 : 0.85));
            }
        }
        const motifVoice = (t, dur, m, v) => {
            if (V.hybrid) { const h = Math.max(dur, STEP * 2); feltNote(t, m, v * 0.85, h); marimba(t, m, v * 0.4); celesta(t, m + 12, v * 0.18, h); }
            else if (V.orch) celesta(t, m, v);
            else { pianoNote(t, m, v * 0.8); celesta(t, m + 12, v * 0.3); }
        };
        /* (20 Oct 2026, the owner's: "the use of the deep fat horn halfway through the lead feels very off"; and in
           the bigger parts "a lot going on, lots of overlapping sustain ... the track loses control of itself") the
           hybrid's tune is the ghost's alone, and at the peaks the violins with it in unison, legato, nothing more:
           not the horns an octave under it, nor the trumpets, nor the made choir on its long notes (all of which
           came in halfway through the hook and doubled the tune in the middle of everything else) */
        const hookVoice = (peak) => (t, dur, m, v) => {
            if (V.hybrid) { ghost(t, dur, m, v * 0.9); if (peak) strings(vHi, t, dur, m, v * 0.34, 0.08, 0.3); return; }
            else { brass(horns, t, dur, m, v, "horn"); brass(horns, t, dur, m - 12, v * 0.55, "horn"); }
            if (peak) { brass(tpts, t, dur, m, v * (V.hybrid ? 0.4 : 0.75), "tpt"); if (V.trailer) strings(lead, t, dur, m + 12, v * 0.5, 0.02, 0.3); }
            // (19 Oct 2026) at the peaks, the violins on the tune and the violas an octave under, legato
            if (peak) { strings(vHi, t, dur, m, v * 0.42, 0.06, 0.4); strings(vHi, t, dur, m - 12, v * 0.36, 0.06, 0.4); }
        };

        // ---- another song's score (17 Oct 2026: the Depths, the Steamworks), given the same instruments
        // (or, on the dev server, a probe: one instrument played alone, to measure it; RatEpic._probe)
        if (V.probe || (V.song && SONGS[V.song])) {
            (V.probe || SONGS[V.song].score)({ V, at, R, seg, strings, spic, brass, fmHorn, marimba, choir, celesta, harpNote, pianoNote, flute, oboe, timpani, timpRoll, taiko, tom, snare, snareRoll, crash, swell, braam, riser, boom, tick,
                ghost, bigSnare, glass, glassChords, wind, revSwell, sub, heart, feltNote, toll, chug, metal, clank, hiss, pads, line, arp, voice, toBar,
                vHi, vLo, basses, spicc, trem, horns, tpts, tbns, keys, harp, piano, winds, perc, timp, cym, fx, sample, felt });
            return;
        }

        // ================================================================ THE SCORE
        /* ---- -4 THE DESCENT (12) (reworked 19 Oct 2026, the owner's: "the intro should be more progressive and
           drawn out, the french horns only playing a few notes of the lead once"; and "some odd background noise
           that sounds a bit like white noise" near the start: the made wind that ran under all of it, gone). It
           rises out of nothing, a layer at a time:
              -4  the low C alone, out of silence; a piano's low C, far off
              -2  the cellos' fifth over it; the bowed glass; the choir beginning to breathe
               0  THE HORNS: the hook's opening leap, C G C, once, slow, the whole section in unison
               2  the motif's first two bars on the piano; the choir closing in, C against Db
               4  the strings rising in under the choir's chords, more of them each bar; the timpani stirring
               6  the ghost; the roll and the swell into the motif */
        strings(basses, at(-4), 12 * BAR, 36, 0.3, 6, 2); strings(vLo, at(-2), 10 * BAR, 48, 0.17, 5, 2); strings(vLo, at(-2, 8), 4.5 * BAR, 55, 0.09, 6, 1.5);   // (the fifth gone before the Ab chords, which it would rub against)
        if (V.trailer) { boom(at(0), 0.9); strings(lead, at(-2), 10 * BAR, 24, 0.25, 4, 2); }
        choir("oo", at(-2), 2 * BAR, 60, 0.07); choir("oo", at(-1), BAR, 67, 0.05);
        swell(at(-1), BAR, 0.22); timpani(at(0), 36, 0.3);
        /* the horns (reworked 20 Oct 2026, the owner's: "too slow, maybe it needs more than 3 notes, it should be
           similar to how the french horns at the end of ... Defying Gravity play the 'unlimited' notes. If it would
           make more sense for this to move to the end of our track too, that's fine"): THE CALL, the hook's whole
           first bar at its own pace (C, G, C, Bb, G, F, G), its last note held. Here, far off and soft, the
           promise of it; at the end, full, as the piece's last word (68 THE ENDING). */
        for (const [st, len, m, v] of [[0, 3, 60, 0.4], [3, 3, 67, 0.44], [6, 3, 72, 0.5], [9, 2, 70, 0.44], [12, 1, 67, 0.4], [13, 2, 65, 0.4], [15, 14, 67, 0.46]]) brass(horns, at(0, st), len * STEP, m, v, "horn");
        for (let b = 2; b < 8; b++) pads(b, ["Cm", "Cm", "Cm", "Db", "Ab", "Ab", "Gsus", "G"][b], 0, { hi: false, lo: false, choir: "oo", choirV: 0.14, att: 1.2, rel: 1.6 });
        // the strings coming in under them, a little more each bar
        for (let b = 4; b < 8; b++) pads(b, ["Ab", "Ab", "Gsus", "G"][b - 4], 0, { hi: b >= 6, lo: false, mid: true, k: 0.42 + 0.14 * (b - 4), att: 1.4, rel: 1.2 });
        for (const [b, v] of [[4, 0.18], [5, 0.22], [6, 0.28], [7, 0.32]]) timpani(at(b), b < 6 ? 44 : 43, v);
        line(A_LEAD, 2, 0, V.orch ? (t, d, m, v) => { celesta(t, m, v); pianoNote(t, m - 12, v * 0.5, Math.max(d, STEP * 2)); } : motifVoice, b => 0.32 + 0.04 * (b - 2), 0, 2);
        if (!V.hybrid) line(A_LEAD, 5, -12, V.orch ? (t, d, m, v) => flute(t, d + 0.3, m + 12, v * 0.6) : motifVoice, () => 0.3, 0, 2);
        timpRoll(at(6), at(8) - 0.05, 36, 0.05, 0.3); swell(at(6, 8), BAR * 1.5 - STEP * 8 + 0.02, 0.35);
        if (V.trailer) for (let b = 4; b < 8; b++) for (let s = 0; s < 16; s += 4) tick(at(b, s), 0.12 + 0.03 * (b - 4));
        if (V.hybrid) {
            glass(at(-3), 5 * BAR, 84, 0.05);
            // the choir closing in: C against Db, then G against Ab
            choir("oo", at(1), 3 * BAR, 72, 0.12); choir("oo", at(2), 2 * BAR, 73, 0.09); choir("oo", at(5), 2 * BAR, 67, 0.1); choir("oo", at(5, 8), 1.5 * BAR, 68, 0.08);
            for (const [b, m] of [[-4, 24], [-2, 36], [0, 36], [2, 36], [4, 32], [6, 31]]) feltNote(at(b), m, 0.3); feltNote(at(4), 20, 0.2);
            line(A_LEAD, 6, 0, (t, d, m, v) => ghost(t, Math.max(d, STEP * 3), m, v), () => 0.22, 0, 2);
            revSwell(at(8), 1.5, [48, 55, 60, 63], 0.35);
        }

        // ---- 8 THE MOTIF (8): the bell motif whole over an ostinato, the strings rising in under it
        for (let i = 0; i < 8; i++) {
            const b = 8 + i, d = shape(b);
            pads(b, A_CHORDS[i], 0, { hi: i >= 2, choir: i >= 4 ? "oo" : null, choirV: 0.12, att: 0.6 });
            if (V.trailer) arp(b, A_CHORDS[i], -12, (t, m, v) => pulseNote(t, m, v), 0.5 + 0.4 * d, true, 43);
            else arp(b, A_CHORDS[i], 0, (t, m, v) => harpNote(t, m, v), 0.2 + 0.18 * d, false, 55);
            taiko(at(b), 0.25 + 0.3 * d, false); if (i % 2) tom(at(b, 10), 0.12 + 0.15 * d);
        }
        line(A_LEAD, 8, 0, (t, dur, m, v) => {
            if (V.orch) { if (t < at(12)) oboe(t, Math.max(dur, STEP * 3), m, v * 0.75); else brass(horns, t, Math.max(dur, STEP * 3), m - 12, v * 0.8, "horn"); celesta(t, m + 12, v * 0.25); }
            else motifVoice(t, dur, m, v);
        }, b => 0.38 + 0.05 * (b - 8));
        timpRoll(at(15, 8), at(16) - 0.03, 43, 0.1, 0.55);

        // ---- 16 FIRST BUILD (4): low strings driving on a G pedal, the brass climbing, timpani, swell
        for (let i = 0; i < 4; i++) {
            const b = 16 + i;
            for (let s = 0; s < (i === 3 ? 14 : 16); s += 2) { spic(spicc, at(b, s), 31, 0.3 + 0.08 * i); spic(spicc, at(b, s + 1), 43, 0.2 + 0.06 * i); }
            pads(b, "G", 0, { hi: i >= 2, mid: true, choir: i >= 2 ? "ah" : "oo", choirV: 0.18, att: 0.2 });
            taiko(at(b), 0.6 + 0.1 * i, true); taiko(at(b, 8), 0.4 + 0.1 * i); tom(at(b, 12), 0.25 + 0.08 * i); tom(at(b, 14), 0.25 + 0.08 * i);
            if (V.trailer) for (let s = 0; s < 16; s++) pulseNote(at(b, s), 31 + (s % 2 ? 12 : 0), 0.4 + 0.08 * i);
        }
        line(C_LEAD, 16, 0, (t, d, m, v) => brass(tbns, t, d, m - 12, v, "tbn"), () => 0.42, 2, 4);
        /* (19 Oct 2026, the owner's: "Using french horns for the build up sequence seems off to me") the climb on the
           violins and violas in octaves, marcato, over the trombones (and the tuba) */
        line(C_LEAD, 18, 0, (t, d, m, v) => { strings(vHi, t, d, m, v * 0.8, 0.03, 0.35); strings(vHi, t, d, m - 12, v * 0.7, 0.03, 0.35); brass(tbns, t, d, m - 12, v * 0.7, "tbn"); }, () => 0.55, 2, 4);
        timpRoll(at(18), at(19, 13), 43, 0.2, 0.6); snareRoll(at(19), at(19, 13), 0.05, 0.35); swell(at(18), 2 * BAR - 3 * STEP, 0.6);
        if (V.hybrid) { revSwell(at(20), 2.2, [43, 55, 62, 67], 0.5); sub(at(16), 4 * BAR - 3 * STEP, 31, 0.35); }
        if (V.trailer) { braam(at(16), 2 * BAR, 31, 0.8); riser(at(18), 2 * BAR, 0.6); }

        // ---- 20 THE HOOK (16): full brass, the countermelody, the bells; the choir and trumpets for the higher half
        for (let i = 0; i < 16; i++) {
            /* (17 Oct 2026) in three stages: four bars of the slow beat alone (the big drum on one, the big snare on
               three, the bass in long notes), four with the groove and the strings' figures, then everything */
            const b = 20 + i, d = shape(b), high = i >= 8, stage = i < 4 ? 0 : i < 8 ? 1 : 2;
            pads(b, B_CHORDS[i], 0, { mid: stage > 0, choir: high ? "ah" : "oo", choirV: high ? (V.hybrid ? 0.14 : 0.22) : 0.12, att: 0.12, rel: 0.4, k: stage === 0 ? 0.75 : 1 });
            if (stage > 0) groove(b, B_CHORDS[i], 0, 0.42 + 0.2 * d, GROOVE[i % 2]);
            else for (const [s, len, c] of halves(B_CHORDS[i], 0)) spic(spicc, at(b, s), c.root, 0.55, len * STEP * 0.9);
            if (V.trailer) arp(b, B_CHORDS[i], -12, (t, m, v) => pulseNote(t, m, v), stage ? 0.75 : 0.45, true, 43);
            else if (stage > 0) arp(b, B_CHORDS[i], 0, (t, m, v) => spic(trem, t, m + 12, v, 0.1), 0.4 + 0.2 * d, false, 60);
            if (V.hybrid && stage > 0) for (const [s, len, c] of halves(B_CHORDS[i], 0)) sub(at(b, s), len * STEP, c.root - 12, stage === 2 ? 0.55 : 0.38);
            // (19 Oct 2026) the piano: from the groove on, an ostinato high up, eighths, the modern film score's
            if (V.hybrid && stage === 1) arp(b, B_CHORDS[i], 0, (t, m, v) => pianoNote(t, m, v, STEP * 1.5), 0.26, false, 72);
            // the drums: the slow beat (a big drum on one, the big snare on three); then the drum on the "and" of two, a smaller answer
            taiko(at(b), 0.75, true); bigSnare(at(b, 8), stage === 0 ? 0.5 : 0.62 + (high ? 0.08 : 0));
            /* (20 Oct 2026, the owner's: "Some of the beats just sound like knocking constantly") in the hybrid, the
               big beat (the drum on one, the snare on three) and one low drum on the "and" of two, every other bar
               an answer on four; the toms only to turn a phrase, in its last bar */
            if (V.hybrid) {
                if (stage > 0) { taiko(at(b, 6), 0.4); if (i % 2) taiko(at(b, 12), 0.3); }
                if (i % 4 === 3 && stage > 0) for (const [st, v] of [[12, 0.2], [13, 0.24], [14, 0.28], [15, 0.32]]) tom(at(b, st), v);
            } else {
                if (stage > 0) { taiko(at(b, 6), 0.5); tom(at(b, 10), 0.32); taiko(at(b, 12), 0.45); }
                if (high) { tom(at(b, 14), 0.3); tom(at(b, 15), 0.25); }
            }
            if (i % 4 === 0) { crash(at(b), i === 0 || i === 8 ? 0.7 : 0.4); timpani(at(b), B_CHORDS[i].startsWith("G") ? 43 : 36, 0.6); }
            if (V.trailer && i % 4 === 0) boom(at(b), i === 0 || i === 8 ? 0.85 : 0.5);
        }
        line(B_LEAD, 20, 0, (t, d, m, v) => hookVoice(t >= at(28))(t, d, m, v), (b, n) => (b < 28 ? 0.6 : 0.8) + 0.18 * shape(b) + (n.len >= 4 ? 0.05 : 0));
        if (!V.hybrid) line(B_LEAD, 28, 12, (t, d, m, v) => { if (d >= STEP * 4) choir("ah", t, d, m - 12, 0.48, 0.3); }, () => 1, 8, 16);
        line(B_COUNTER, 20, 0, (t, d, m, v) => { strings(vLo, t, d, m - 12, 0.42, 0.15, 0.6); if (!V.hybrid) brass(tbns, t, d, m - 12, v, "tbn"); }, () => 0.42);
        line(B_BELL, 20, 0, (t, d, m, v) => { const h = Math.max(d, STEP * 2); if (V.hybrid) { marimba(t, m, v * 0.5); feltNote(t, m, v * 0.5, h); } celesta(t, m + 12, v * 0.5, h); }, () => 0.45);
        if (V.hybrid) { glassChords(28, B_CHORDS.slice(8, 16), 0, 0.03, 86); revSwell(at(28), 1.6, [56, 63, 68, 72], 0.35); }
        snareRoll(at(35, 8), at(36) - 0.05, 0.1, 0.55); swell(at(35), BAR, 0.6);
        // (the hook's last bar: the toms rolling down into the breakdown)
        for (let s = 0; s < 8; s += 1) tom(at(35, s), 0.2 + 0.03 * s);

        // ---- 36 BREAKDOWN (8): gone at once; the motif on one voice over soft strings, a far-off heartbeat
        if (V.trailer) boom(at(36), 0.7);
        crash(at(36), 0.35);
        for (let i = 0; i < 8; i++) {
            const b = 36 + i;
            pads(b, A_CHORDS[i], 0, { hiLo: 64, choir: i >= 4 ? "oo" : null, choirV: 0.08, att: 1.1, rel: 1.5, k: 0.55 });
            if (V.hybrid) { if (i % 2 === 0) heart(at(b), 0.55); }
            else if (i % 2 === 0) { timpani(at(b), 36, 0.22); timpani(at(b, 3), 36, 0.12); }
            if (V.trailer && i >= 2) for (let s = 0; s < 16; s += 2) tick(at(b, s), 0.06 + 0.012 * i);
            if (i >= 4 && !V.trailer) arp(b, A_CHORDS[i], 0, (t, m, v) => harpNote(t, m, v), 0.16, false, 55);
        }
        line(A_LEAD, 36, 0, (t, d, m, v) => { if (V.orch) pianoNote(t, m, v); else if (V.hybrid) { const h = Math.max(d, STEP * 2); feltNote(t, m, v * 1.1, h); feltNote(t, m - 12, v * 0.35, h); } else pianoNote(t, m, v); }, b => 0.26, 0, 4);
        line(A_LEAD, 40, 0, (t, d, m, v) => { v *= 0.7; const dur = toBar(t, Math.max(d, STEP * 3.5)); if (V.trailer) strings(lead, t, dur, m, v * 0.7, 0.08, 0.6); else if (V.hybrid) ghost(t, dur, m, v * 0.75); else brass(horns, t, dur, m - 12, v, "horn"); }, () => 0.45, 4, 8);
        if (V.hybrid) { glassChords(36, A_CHORDS, 0, 0.055, 80); choir("oo", at(39), BAR, 67, 0.08); feltNote(at(36), 24, 0.3); feltNote(at(40), 32, 0.25); }
        // (17 Oct 2026) under the ghost, a line in the cellos of the motif's own chords (the hook's counter-line was here, written for other chords: Ab and Bb over G)
        A_CHORDS.slice(4, 8).forEach((str, i) => { for (const [s, len, c] of halves(str, 0)) { const ts = voice(c.tones, 52); strings(vLo, at(40 + i, s), len * STEP / 2, ts[1], 0.18, 0.4, 0.8); strings(vLo, at(40 + i, s + len / 2), len * STEP / 2, ts[0], 0.16, 0.4, 0.8); } });

        // ---- 44 SECOND BUILD (8): the ostinato back, quickening; the hook thrown between the brass; up a tone, onto A
        const BUILD = ["Cm", "Cm", "Ab", "Bb", "Cm", "Db", "G", "G"], LIFT = [0, 0, 0, 0, 0, 0, 2, 2];
        for (let i = 0; i < 8; i++) {
            const b = 44 + i, d = shape(b), c = halves(BUILD[i], LIFT[i])[0][2], fast = i >= 4;
            pads(b, BUILD[i], LIFT[i], { hi: i >= 2, mid: i >= 4, choir: i >= 5 ? "ah" : "oo", choirV: 0.14 + 0.03 * i, att: 0.4 });
            for (let s = 0; s < 16; s += fast ? 1 : 2) spic(spicc, at(b, s), c.root + (s % 4 === 2 ? 12 : 0), 0.3 + 0.22 * d);
            if (V.trailer) for (let s = 0; s < 16; s++) pulseNote(at(b, s), c.root + (s % 2 ? 12 : 0), 0.4 + 0.3 * d);
            taiko(at(b), 0.45 + 0.4 * d, true); taiko(at(b, 8), 0.3 + 0.4 * d);
            if (fast) for (let s = 4; s < 16; s += 4) tom(at(b, s), 0.2 + 0.25 * d);
        }
        line(B_LEAD, 44, -12, (t, d, m, v) => brass(tbns, t, d, m, v, "tbn"), () => 0.55, 0, 2);
        // (19 Oct 2026: the builds' lines off the horns, as the first's, onto the strings in octaves over the low brass)
        line(B_LEAD, 46, 0, (t, d, m, v) => { strings(vLo, t, d, m - 12, v * (V.hybrid ? 0.5 : 0.8), 0.05, 0.4); strings(vLo, t, d, m - 24, v * (V.hybrid ? 0.42 : 0.65), 0.05, 0.4); if (V.hybrid) ghost(t, d, m, v * 0.7); }, () => 0.65, 2, 4);
        line(C_LEAD, 48, 0, (t, d, m, v) => { strings(vHi, t, d, m, v * 0.8, 0.03, 0.35); strings(vHi, t, d, m - 12, v * 0.7, 0.03, 0.35); brass(tbns, t, d, m - 12, v * 0.7, "tbn"); }, () => 0.72, 2, 4);
        line(C_LEAD, 50, 2, (t, d, m, v) => { brass(tpts, t, d, m, v * 0.8, "tpt"); strings(vHi, t, d, m, v * 0.75, 0.03, 0.35); strings(vHi, t, d, m - 12, v * 0.7, 0.03, 0.35); brass(tbns, t, d, m - 24, v * 0.7, "tbn"); }, () => 0.68, 2, 4);
        timpRoll(at(50), at(51, 12) - 0.03, 45, 0.2, 0.65); snareRoll(at(50, 8), at(51, 12) - 0.03, 0.05, 0.45); swell(at(50), 2 * BAR - 4 * STEP, 0.6);
        if (V.hybrid) { revSwell(at(51, 12), 2.4, [45, 52, 57, 61, 64], 0.5); for (let i = 4; i < 8; i++) { const c = halves(BUILD[i], LIFT[i])[0][2]; sub(at(44 + i), (i === 7 ? 12 : 16) * STEP, c.root - 12, 0.4); } }
        if (V.trailer) { riser(at(49), 3 * BAR - 4 * STEP, 0.75); braam(at(50), 1.6 * BAR, 33, 0.7); }
        // (the breath before it: the last beat of bar 51 left silent)

        // ---- 52 THE CLIMAX (16): the hook a tone higher, in D minor, with everything
        for (let i = 0; i < 16; i++) {
            const b = 52 + i, d = shape(b);
            /* (17 Oct 2026) bars 60 and 61: everything falls away but the tune, the choir and the deep sub, the
               plate ringing; then a swell drawn backwards, and back, bigger */
            if (i === 8 || i === 9) {
                for (const [s, len, c] of halves(B_CHORDS[i], 2)) { for (const m of voice(c.tones, 62)) choir("oo", at(b, s), len * STEP, m, 0.16); sub(at(b, s), len * STEP, c.root - 12, 0.3); strings(vLo, at(b, s), len * STEP, c.root + 12, 0.12, 0.4, 0.8); }
                if (i === 9) { revSwell(at(62), 2.4, [46, 53, 58, 62, 65], 0.55); swell(at(61), BAR, 0.8); }
                continue;
            }
            if (V.hybrid) for (const [s, len, c] of halves(B_CHORDS[i], 2)) sub(at(b, s), len * STEP, c.root - 12, i >= 10 ? 0.65 : 0.55);
            /* (20 Oct 2026) the hybrid's climax given room: its chords on the strings with less of the made choir,
               the piano on the bells' answers only (its low octaves and its ostinato, added the day before, were
               more sustain on sustain), the strings' sixteenths lighter */
            pads(b, B_CHORDS[i], 2, { mid: true, choir: "ah", choirV: V.hybrid ? 0.2 : 0.36, att: 0.08, rel: 0.4, k: V.hybrid ? 1 : 1.2 });
            groove(b, B_CHORDS[i], 2, 0.8, GROOVE[i % 2]);
            for (const [s, len, c] of halves(B_CHORDS[i], 2)) for (let k = 0; k < len; k++) { const ts = voice(c.tones, 67); spic(trem, at(b, s + k), ts[k % ts.length], V.hybrid ? 0.4 : 0.52, 0.09); }
            if (V.trailer) { arp(b, B_CHORDS[i], -10, (t, m, v) => pulseNote(t, m, v), 0.9, true, 43); if (i % 4 === 0) { boom(at(b), 0.95); braam(at(b), BAR * 0.9, halves(B_CHORDS[i], 2)[0][2].root + 12, 0.55); } }
            if (V.hybrid) {
                // (20 Oct 2026) the hybrid's: the big beat, the low drum on the "and" of two and on four, the toms only to turn a phrase
                taiko(at(b), 0.95, true); bigSnare(at(b, 8), 0.8); taiko(at(b, 6), 0.55); taiko(at(b, 12), 0.42);
                if (i % 4 === 3 || i === 15) for (const [st, v] of [[12, 0.26], [13, 0.3], [14, 0.34], [15, 0.38]]) tom(at(b, st), v);
                if (i >= 12) bigSnare(at(b, 14), 0.35);
            } else {
                taiko(at(b), 0.95, true); taiko(at(b, 6), 0.65); tom(at(b, 10), 0.42); taiko(at(b, 12), 0.6); bigSnare(at(b, 8), 0.8); tom(at(b, 14), 0.35); tom(at(b, 15), 0.3);
                if (i >= 10) { for (let s = 1; s < 16; s += 2) snare(at(b, s), 0.12); bigSnare(at(b, 12), 0.45); }
            }
            if (i % 4 === 0 || i === 10) { crash(at(b), i === 0 || i === 10 ? 0.95 : 0.6); timpani(at(b), halves(B_CHORDS[i], 2)[0][2].root, 0.85); if (V.hybrid && (i === 0 || i === 10)) boom(at(b), 0.6); }
        }
        crash(at(52), 0.6); timpani(at(52), 38, 1);
        line(B_LEAD, 52, 2, (t, d, m, v) => { const drop = t >= at(60) && t < at(62); if (drop && V.hybrid) { ghost(t, d, m, v * 0.85); return; } hookVoice(!drop)(t, d, m, v); if (V.hybrid) return; if (!drop) brass(tpts, t, d, m - 12, v * 0.5, "tpt"); if (d >= STEP * 4) choir("ah", t, d, m - 12, drop ? 0.22 : 0.55, 0.3); }, (b, n) => (b >= 60 && b < 62 ? 0.7 : 0.98) + (n.len >= 4 ? 0.06 : 0));
        // (the counter-line: in the hybrid, the horns and the cellos, an octave apart; the trombones for the others)
        line(B_COUNTER, 52, 2, (t, d, m, v) => { if (t >= at(60) && t < at(62)) return; strings(vLo, t, d, m - 12, 0.5, 0.1, 0.6); if (!V.hybrid) brass(tbns, t, d, m - 12, v, "tbn"); brass(horns, t, d, m, v * 0.6, "horn"); }, () => 0.62);
        line(B_BELL, 52, 2, (t, d, m, v) => { const h = Math.max(d, STEP * 2); celesta(t, m + 12, v, h); if (V.hybrid) { marimba(t, m, v * 0.5); feltNote(t, m, v * 0.5, h); } }, () => 0.55);
        if (V.hybrid) { glassChords(60, B_CHORDS.slice(8, 10), 2, 0.06, 84); glassChords(62, B_CHORDS.slice(10, 16), 2, 0.025, 88); }
        // a counter-line of its own in the first half, the horns answering the tune
        line(B_COUNTER.map((x, i) => B_COUNTER[i + 4] || ""), 52, 2, (t, d, m, v) => brass(horns, t, d, m, v, "horn"), () => 0.5, 0, 4);

        // ---- 68 THE ENDING (6): hits, a long held D minor, the motif once more as it dies away
        const DM = chord("Cm", 2), BB = chord("Ab", 2), AA = chord("G", 2);
        // (the horns are the call's now: the chords' hits on the trumpets, trombones and strings)
        const hit = (t, c, v, dur) => {
            for (const m of voice(c.tones, 62)) { brass(tpts, t, dur, m + 12, v * 0.7, "tpt"); strings(vHi, t, dur, m + 12, 0.45 * v, 0.01, 0.4); }
            brass(tbns, t, dur, c.root + 12, v, "tbn"); strings(basses, t, dur, c.root, 0.6 * v, 0.01, 0.5); spic(spicc, t, c.root, v, dur);
            taiko(t, v, true); timpani(t, c.root, v * 0.9);
            if (V.hybrid) for (const m of voice(c.tones, 62)) fmHorn(t, dur, m, v * 0.5);
            if (V.trailer) boom(t, v);
        };
        hit(at(68), DM, 1, STEP * 3); crash(at(68), 0.9); hit(at(68, 10), BB, 0.8, STEP * 1.5); hit(at(68, 12), AA, 0.9, STEP * 3);
        hit(at(69), BB, 0.85, STEP * 6); hit(at(69, 8), AA, 1, STEP * 7);
        /* THE CALL (20 Oct 2026): over the hits, the horns, all of them, full: the hook's first bar in D (D, A, D, C,
           A, G, A), then up to F over the Bb and E over the A, and home to D, held over the last chord */
        for (const [b, st, len, m, v] of [[68, 0, 3, 62, 0.86], [68, 3, 3, 69, 0.9], [68, 6, 3, 74, 0.95], [68, 9, 3, 72, 0.9], [68, 12, 1, 69, 0.86], [68, 13, 2, 67, 0.86], [68, 15, 1, 69, 0.9],
            [69, 0, 8, 77, 1], [69, 8, 8, 76, 0.97], [70, 0, 26, 74, 1]]) { brass(horns, at(b, st), len * STEP, m, v, "horn"); if (b === 70) brass(tpts, at(b, st), len * STEP, m + 12, 0.5, "tpt"); }
        // the held chord, two bars, swelling and falling, the timpani rolling under it
        const hold = at(70), hd = 2 * BAR;
        for (const m of voice(DM.tones, 62)) { brass(tpts, hold, hd * 0.6, m + 12, 0.45, "tpt"); strings(vHi, hold, hd, m + 12, 0.5, 0.05, 2.2); choir("ah", hold, hd, m, 0.55); if (V.hybrid) fmHorn(hold, hd, m, 0.45); }
        brass(tbns, hold, hd, 50, 0.85, "tbn"); brass(tbns, hold, hd, 38, 0.75, "tbn"); strings(basses, hold, hd + BAR, 38, 0.6, 0.05, 3); strings(vLo, hold, hd, 50, 0.45, 0.05, 2.5);
        crash(hold, 1); taiko(hold, 1, true); timpRoll(hold + 0.05, hold + hd * 0.85, 38, 0.8, 0.25);
        if (V.trailer) { boom(hold, 1); braam(hold, hd, 38, 0.7); }
        // and the motif, once more, softly, over the dying D
        strings(basses, at(72), 2 * BAR, 38, 0.18, 0.8, 3); choir("oo", at(72), 2 * BAR, 62, 0.14); choir("oo", at(72), 2 * BAR, 65, 0.12);
        line(A_LEAD, 72, 2, (t, d, m, v) => { if (V.hybrid) { ghost(t, Math.max(d, STEP * 3), m, v * 0.8); feltNote(t, m - 12, v * 0.4, Math.max(d, STEP * 2)); } else celesta(t, m, v); }, b => (b === 72 ? 0.3 : 0.22), 0, 1);
        if (V.hybrid) {
            glass(at(71), 3 * BAR, 86, 0.05);
            for (const [b, st, len, m] of [[68, 0, 10, 26], [68, 10, 2, 34], [68, 12, 4, 33], [69, 0, 8, 34], [69, 8, 8, 33], [70, 0, 56, 26]]) sub(at(b, st), len * STEP, m, 0.5);
        }
        celesta(at(73, 4), 62 + 12, 0.18); harpNote(at(73, 4), 50, 0.25); timpani(at(73, 4), 38, 0.18);

    }
    /* ================================================================ THE OTHER SONGS
       (17 Oct 2026, the owner's: "give Dark Depths and Steamworks Factory soundtracks a epic cinematic version
       as well"; his choice: "hybrid, each in character". The same instruments, the same craft as the Mine's
       hybrid, each its own tune and its own colour.) */
    const SONGS = {
        /* THE DEPTHS, EPIC. A minor, its flat second (Bb) the Depths' own; 72 a minute, 60 bars, about three
           minutes and twenty. Darker and slower than the Mine, more haunted: bells tolling the four-note
           motif in the deep, the ghost for the ocarina, the choir in the Phrygian rub (A against Bb).
              0  THE ABYSS (8)     a deep drone, wind, a heartbeat, the bell tolling, the choir rubbing
              8  THE MOTIF (8)     the motif on the ghost over the bell, a felt piano turning slowly
             16  DESCENT (4)       low brass climbing on an E pedal, the drums waking
             20  THE HOOK (8)      the ocarina's hook on the ghost over the slow beat
             28  THE HOOK, HIGH (8) an octave up, the horns and the full choir with it: the first peak
             36  THE DROWNING (8)  all of it gone: the heartbeat, the wind, the ghost far off
             44  RISING (4)        the bells' fall (A, Bb, A, G#), then the climb
             48  THE CLIMAX (8)    the hook with everything
             56  THE END (4)       a held A minor, the bell, the motif once more, and the deep */
        dark: {
            bpm: 72, bars: 60,
            shape: [[0, 0.15], [8, 0.28], [16, 0.42], [19.9, 0.62], [20, 0.72], [27.9, 0.8], [28, 0.9], [35.9, 0.95], [36, 0.14], [43.9, 0.24], [44, 0.42], [47.9, 0.8], [48, 1], [55.9, 1], [56, 0.92], [57.5, 0.4], [60, 0.08]],
            score(K) {
                const { at, toBar, ghost, toll, choir, glass, glassChords, wind, heart, sub, feltNote, pads, line, arp, voice, strings, spic, brass, celesta, taiko, tom, bigSnare, snare, snareRoll, timpRoll, timpani, crash, swell, revSwell, vLo, spicc, trem, horns, tpts, tbns } = K;
                const T = DK, S = STEP, B = BAR, R0 = c => halves(c, 0)[0][2].root;
                const subs = (b, str, v) => { for (const [s, len, c] of halves(str, 0)) sub(at(b, s), len * S, c.root - 12, v); };
                // ---- 0 THE ABYSS
                sub(at(0), 8 * B, 33, 0.32); for (const b of [0, 2, 4, 6]) heart(at(b), 0.5);
                glass(at(1), 6 * B, 81, 0.05); choir("oo", at(2), 5 * B, 57, 0.12); choir("oo", at(3), 1.5 * B, 58, 0.07);
                for (const [b, m] of [[0, 45], [2, 45], [4, 40], [6, 45]]) toll(at(b), m, 0.42);
                line(T.A_LEAD, 4, 0, (t, d, m, v) => ghost(t, toBar(t, Math.max(d, S * 4)), m, v), () => 0.2, 0, 2);
                strings(vLo, at(4), 4 * B, 45, 0.16, 3, 2);
                revSwell(at(8), 2.2, [45, 52, 57, 60], 0.3);
                // ---- 8 THE MOTIF
                for (let i = 0; i < 8; i++) {
                    const b = 8 + i;
                    pads(b, T.A_CHORDS[i], 0, { hi: i >= 2, choir: i >= 4 ? "oo" : null, choirV: 0.1, att: 0.8, k: 0.8 });
                    arp(b, T.A_CHORDS[i], 0, (t, m, v) => feltNote(t, m, v, S * 2.5), 0.17, false, 52);
                    taiko(at(b), 0.35, true); subs(b, T.A_CHORDS[i], 0.28);
                }
                line(T.A_LEAD, 8, 0, (t, d, m, v) => ghost(t, toBar(t, Math.max(d, S * 3)), m, v), b => 0.4 + 0.03 * (b - 8));
                for (let i = 0; i < 8; i++) toll(at(8 + i), R0(T.A_CHORDS[i]) + 12, 0.22);
                timpRoll(at(15, 8), at(16) - 0.03, 40, 0.1, 0.45);
                // ---- 16 DESCENT: low brass climbing on an E pedal
                for (let i = 0; i < 4; i++) {
                    const b = 16 + i;
                    for (let st = 0; st < (i === 3 ? 14 : 16); st += 2) { spic(spicc, at(b, st), 28, 0.32 + 0.08 * i); spic(spicc, at(b, st + 1), 40, 0.22 + 0.06 * i); }
                    pads(b, "E", 0, { hi: i >= 2, mid: true, choir: i >= 2 ? "ah" : "oo", choirV: 0.16, att: 0.3 });
                    taiko(at(b), 0.6 + 0.08 * i, true); taiko(at(b, 8), 0.4 + 0.08 * i); tom(at(b, 12), 0.25 + 0.06 * i);
                }
                line(T.C_LEAD, 16, -12, (t, d, m, v) => brass(tbns, t, d, m, v, "tbn"), () => 0.45, 2, 4);
                line(T.C_LEAD, 18, 0, (t, d, m, v) => { brass(horns, t, d, m, v * 0.7, "horn"); brass(tbns, t, d, m - 12, v * 0.7, "tbn"); }, () => 0.55, 2, 4);
                timpRoll(at(18), at(19, 13), 40, 0.2, 0.6); snareRoll(at(19), at(19, 13), 0.05, 0.35); swell(at(18), 2 * B - 3 * S, 0.55);
                revSwell(at(20), 2.4, [40, 52, 56, 59, 64], 0.45); sub(at(16), 4 * B - 3 * S, 28, 0.35);
                // ---- 20 THE HOOK, on the slow beat
                for (let i = 0; i < 8; i++) {
                    const b = 20 + i;
                    pads(b, T.B_CHORDS[i], 0, { mid: i >= 4, choir: "oo", choirV: 0.12, att: 0.2, rel: 0.6 });
                    for (const [s, len, c] of halves(T.B_CHORDS[i], 0)) spic(spicc, at(b, s), c.root, 0.5, len * S * 0.9);
                    taiko(at(b), 0.72, true); bigSnare(at(b, 8), 0.6); if (i >= 4) { taiko(at(b, 6), 0.42); tom(at(b, 12), 0.28); }
                    subs(b, T.B_CHORDS[i], 0.4);
                }
                crash(at(20), 0.55); timpani(at(20), 45, 0.6);
                line(T.B_LEAD, 20, 0, (t, d, m, v) => { ghost(t, d, m, v); if (d >= S * 4) choir("oo", t, d, m - 12, 0.2, 0.3); }, () => 0.62);
                line(T.B_ANSWER, 20, 0, (t, d, m, v) => celesta(t, m + 12, v, S * 2), () => 0.35);
                // ---- 28 THE HOOK, AN OCTAVE UP: the first peak
                for (let i = 0; i < 8; i++) {
                    const b = 28 + i;
                    pads(b, T.B_CHORDS[i], 0, { mid: true, choir: "ah", choirV: 0.24, att: 0.1, rel: 0.5 });
                    for (const [s, len, c] of halves(T.B_CHORDS[i], 0)) { for (let k = 0; k < len; k += 2) spic(spicc, at(b, s + k), c.root + (k % 4 === 2 ? 12 : 0), 0.5); const ts = voice(c.tones, 64); for (let k = 0; k < len; k++) spic(trem, at(b, s + k), ts[k % ts.length], 0.4, 0.09); }
                    taiko(at(b), 0.85, true); taiko(at(b, 6), 0.5); tom(at(b, 10), 0.35); bigSnare(at(b, 8), 0.75); taiko(at(b, 12), 0.45); if (i % 2) { tom(at(b, 14), 0.3); tom(at(b, 15), 0.26); }
                    if (i % 4 === 0) { crash(at(b), 0.7); timpani(at(b), R0(T.B_CHORDS[i]), 0.7); }
                    subs(b, T.B_CHORDS[i], 0.55);
                }
                line(T.B_LEAD, 28, 12, (t, d, m, v) => { ghost(t, d, m, v * 0.9); brass(horns, t, d, m - 12, v * 0.55, "horn"); if (d >= S * 4) choir("ah", t, d, m - 12, 0.45, 0.3); }, () => 0.85);
                line(T.B_COUNTER, 28, 0, (t, d, m, v) => { strings(vLo, t, d, m - 12, 0.42, 0.15, 0.6); brass(tbns, t, d, m - 12, v, "tbn"); }, () => 0.45);
                line(T.B_ANSWER, 28, 12, (t, d, m, v) => celesta(t, m, v, S * 2), () => 0.45);
                snareRoll(at(35, 8), at(36) - 0.05, 0.1, 0.5); for (let st = 0; st < 8; st++) tom(at(35, st), 0.2 + 0.03 * st);
                // ---- 36 THE DROWNING
                crash(at(36), 0.3); glassChords(36, T.A_CHORDS, 0, 0.05, 76);
                for (let i = 0; i < 8; i++) { pads(36 + i, T.A_CHORDS[i], 0, { hiLo: 64, att: 1.2, rel: 1.5, k: 0.45 }); if (i % 2 === 0) heart(at(36 + i), 0.55); }
                feltNote(at(36), 33, 0.3); feltNote(at(40), 33, 0.25); toll(at(38), 45, 0.3); toll(at(42), 46, 0.25);
                line(T.A_LEAD, 38, 0, (t, d, m, v) => ghost(t, toBar(t, Math.max(d, S * 4)), m, v), () => 0.26, 4, 8);
                choir("oo", at(40), 2 * B, 69, 0.07); choir("oo", at(40, 8), 1.5 * B, 70, 0.05);
                // ---- 44 RISING: the bells' fall, then the climb
                for (let i = 0; i < 4; i++) {
                    const b = 44 + i;
                    pads(b, T.C_CHORDS[i], 0, { hi: i >= 1, mid: i >= 2, choir: "ah", choirV: 0.12 + 0.05 * i, att: 0.4 });
                    const c = halves(T.C_CHORDS[i], 0)[0][2];
                    for (let st = 0; st < (i === 3 ? 12 : 16); st += i >= 2 ? 1 : 2) spic(spicc, at(b, st), c.root + (st % 4 === 2 ? 12 : 0), 0.3 + 0.08 * i);
                    taiko(at(b), 0.5 + 0.1 * i, true); taiko(at(b, 8), 0.35 + 0.1 * i); if (i >= 2) for (let st = 4; st < 16; st += 4) tom(at(b, st), 0.25 + 0.05 * i);
                    subs(b, T.C_CHORDS[i], 0.35 + 0.05 * i);
                }
                line(T.C_LEAD, 44, 0, (t, d, m, v) => { const h = toBar(t, Math.max(d, S * 6)); ghost(t, h, m, v); choir("ah", t, h, m - 12, 0.3, 0.4); }, () => 0.55, 0, 2);
                line(T.C_LEAD, 46, 0, (t, d, m, v) => { brass(horns, t, d, m, v, "horn"); brass(tbns, t, d, m - 12, v * 0.7, "tbn"); brass(tpts, t, d, m + 12, v * 0.45, "tpt"); }, () => 0.65, 2, 4);
                timpRoll(at(46), at(47, 12) - 0.03, 40, 0.2, 0.65); snareRoll(at(46, 8), at(47, 12) - 0.03, 0.05, 0.45); swell(at(46), 2 * B - 4 * S, 0.6);
                revSwell(at(47, 12), 2.4, [40, 52, 56, 59, 64], 0.5);
                // ---- 48 THE CLIMAX
                for (let i = 0; i < 8; i++) {
                    const b = 48 + i;
                    pads(b, T.B_CHORDS[i], 0, { mid: true, choir: "ah", choirV: 0.36, att: 0.08, rel: 0.5, k: 1.2 });
                    for (const [s, len, c] of halves(T.B_CHORDS[i], 0)) { for (let k = 0; k < len; k += 2) spic(spicc, at(b, s + k), c.root + (k % 4 === 2 ? 12 : 0), 0.7); const ts = voice(c.tones, 67); for (let k = 0; k < len; k++) spic(trem, at(b, s + k), ts[k % ts.length], 0.52, 0.09); }
                    taiko(at(b), 0.95, true); taiko(at(b, 6), 0.65); tom(at(b, 10), 0.42); taiko(at(b, 12), 0.6); bigSnare(at(b, 8), 0.82); bigSnare(at(b, 12), 0.42); tom(at(b, 14), 0.35); tom(at(b, 15), 0.3);
                    for (let st = 1; st < 16; st += 2) snare(at(b, st), 0.12);
                    if (i % 2 === 0) { crash(at(b), i === 0 ? 0.95 : 0.55); timpani(at(b), R0(T.B_CHORDS[i]), 0.85); }
                    subs(b, T.B_CHORDS[i], 0.62);
                }
                line(T.B_LEAD, 48, 12, (t, d, m, v) => { ghost(t, d, m, v * 0.9); brass(horns, t, d, m - 12, v * 0.6, "horn"); brass(tpts, t, d, m, v * 0.35, "tpt"); if (d >= S * 4) choir("ah", t, d, m - 12, 0.55, 0.3); }, () => 0.98);
                line(T.B_COUNTER, 48, 0, (t, d, m, v) => { strings(vLo, t, d, m - 12, 0.5, 0.1, 0.6); brass(tbns, t, d, m - 12, v, "tbn"); }, () => 0.62);
                line(T.B_ANSWER, 48, 12, (t, d, m, v) => celesta(t, m, v, S * 2), () => 0.55);
                // ---- 56 THE END: a held A minor, the bell, the motif, the deep
                const hold = at(56), hd = 2 * B, AM = halves("Am", 0)[0][2];
                for (const m of voice(AM.tones, 64)) { brass(horns, hold, hd, m, 0.85, "horn"); strings(vLo, hold, hd, m, 0.45, 0.05, 2.2); choir("ah", hold, hd, m, 0.5); ghost(hold, hd, m + 12, 0.28); }
                brass(tbns, hold, hd, 45, 0.8, "tbn"); brass(tbns, hold, hd, 33, 0.7, "tbn"); strings(K.basses, hold, hd + B, 33, 0.6, 0.05, 3); sub(hold, hd + 2 * B, 21, 0.5);
                crash(hold, 0.95); taiko(hold, 1, true); timpRoll(hold + 0.05, hold + hd * 0.85, 33, 0.8, 0.25); toll(hold, 45, 0.6); toll(hold, 33, 0.45);
                glass(at(57), 3 * B, 81, 0.05);
                line(T.A_LEAD, 58, 0, (t, d, m, v) => { ghost(t, toBar(t, Math.max(d, S * 4)), m, v); feltNote(t, m - 12, v * 0.4, Math.max(d, S * 2)); }, () => 0.26, 0, 1);
                toll(at(59, 4), 33, 0.3); heart(at(59, 4), 0.35);
            }
        },
        /* THE STEAMWORKS, EPIC. D minor, rising to F major for the flight; 90 a minute, 60 bars, about two
           minutes and forty. The game's three sections (the works waking, flight, the climb) made a
           journey: the machine waking in the dark (an engine's chug gathering speed, a clock, clanks,
           steam), the horn calling over it; the lift into the air (the machinery falls away, strings
           running, the choir); a stall; the climb, driving, metal and brass; the last flight with the
           machine roaring under it; and the engine winding down to nothing.
              0  THE WORKS WAKE (8)   8  THE MACHINE (8)   16  PRESSURE (4)   20  FLIGHT (8)
             28  HIGHER (8)          36  THE STALL (4)    40  THE CLIMB (8)   48  THE LAST FLIGHT (8)   56  WINDING DOWN (4) */
        steam: {
            bpm: 90, bars: 60,
            shape: [[0, 0.2], [8, 0.36], [16, 0.5], [19.9, 0.68], [20, 0.74], [27.9, 0.82], [28, 0.92], [35.9, 0.95], [36, 0.3], [39.9, 0.4], [40, 0.62], [47.9, 0.9], [48, 1], [55.9, 1], [56, 0.9], [58, 0.35], [60, 0.08]],
            score(K) {
                const { at, toBar, ghost, choir, glass, sub, feltNote, pads, line, arp, voice, strings, spic, brass, celesta, harpNote, taiko, tom, bigSnare, snare, snareRoll, timpRoll, timpani, crash, swell, revSwell, tick, chug, metal, clank, hiss, vLo, spicc, trem, horns, tpts, tbns } = K;
                const T = SW, S = STEP, B = BAR, R0 = c => halves(c, 0)[0][2].root;
                const subs = (b, str, v) => { for (const [s, len, c] of halves(str, 0)) sub(at(b, s), len * S, c.root - 12, v); };
                // the machine: the engine every (gap) steps, the metal's sixteenths on the chord, a clank now and then
                const machine = (b, str, gap, v, metalV) => {
                    const ACC = [1, 0.45, 0.72, 0.45];
                    for (let st = 0; st < 16; st += gap) { const k = (st / gap) % 4; chug(at(b, st), v * 0.7 * ACC[k], k === 0); }
                    if (metalV) for (const [s, len, c] of halves(str, 0)) { const ts = voice(c.tones, 76); for (let k = 0; k < len; k++) if ("x.xx.x.x".charAt(k % 8) === "x") metal(at(b, s + k), ts[(k * 2) % ts.length], metalV * (k % 4 === 0 ? 1 : 0.6), 0.18); }
                    if (b % 2 === 1) clank(at(b, 7), v * 0.6);
                };
                // ---- 0 THE WORKS WAKE: the engine gathering, a clock, steam; the horn calling in the dark
                strings(K.basses, at(0), 8 * B, 38, 0.3, 3, 2); strings(vLo, at(0), 8 * B, 50, 0.16, 4, 2); sub(at(0), 8 * B, 26, 0.3);
                for (let b = 0; b < 8; b++) {
                    const gap = b < 2 ? 8 : b < 4 ? 4 : 2;
                    for (let st = 0; st < 16; st += gap) { const k = (st / gap) % 4; chug(at(b, st), (0.25 + 0.05 * b) * [1, 0.5, 0.75, 0.5][k], k === 0); }
                    for (let st = 0; st < 16; st += 4) tick(at(b, st), 0.1);
                    if (b % 2) { hiss(at(b, 10), 0.8, 0.12); clank(at(b, 6), 0.25); }
                }
                line(T.A_LEAD, 2, 0, (t, d, m, v) => { const dur = toBar(t, Math.max(d, S * 6)); brass(horns, t, dur, m, v, "horn"); ghost(t, dur, m + 12, v * 0.35); }, () => 0.5, 0, 4);
                glass(at(4), 4 * B, 86, 0.03); revSwell(at(8), 1.8, [38, 50, 57, 62], 0.35);
                // ---- 8 THE MACHINE: the horn's call whole, the machine turning under it
                for (let i = 0; i < 8; i++) {
                    const b = 8 + i;
                    pads(b, T.A_CHORDS[i], 0, { hi: i >= 2, choir: i >= 4 ? "oo" : null, choirV: 0.12, att: 0.4 });
                    machine(b, T.A_CHORDS[i], 2, 0.35, i >= 2 ? 0.1 : 0);
                    for (const [s, len, c] of halves(T.A_CHORDS[i], 0)) for (let k = 0; k < len; k += 2) spic(spicc, at(b, s + k), c.root + (k % 4 === 2 ? 12 : 0), 0.38);
                    taiko(at(b), 0.5, true); taiko(at(b, 8), 0.35); subs(b, T.A_CHORDS[i], 0.32);
                    for (let st = 0; st < 16; st += 4) tick(at(b, st), 0.07);
                }
                line(T.A_LEAD, 8, 0, (t, d, m, v) => { const dur = toBar(t, Math.max(d, S * 6)); brass(horns, t, dur, m, v, "horn"); brass(horns, t, dur, m - 12, v * 0.4, "horn"); ghost(t, dur, m + 12, v * 0.45); }, b => 0.5 + 0.03 * (b - 8));
                // ---- 16 PRESSURE: brass driving up, the steam building
                for (let i = 0; i < 4; i++) {
                    const b = 16 + i;
                    pads(b, T.C_CHORDS[i], 0, { mid: true, choir: i >= 2 ? "ah" : "oo", choirV: 0.16, att: 0.2 });
                    machine(b, T.C_CHORDS[i], i >= 2 ? 1 : 2, 0.4 + 0.05 * i, 0.12 + 0.03 * i);
                    taiko(at(b), 0.6 + 0.08 * i, true); taiko(at(b, 8), 0.45 + 0.08 * i); tom(at(b, 12), 0.3);
                    subs(b, T.C_CHORDS[i], 0.38);
                }
                line(T.C_LEAD, 16, 0, (t, d, m, v) => { brass(horns, t, d, m, v, "horn"); brass(tbns, t, d, m - 12, v * 0.8, "tbn"); }, () => 0.6);
                hiss(at(18), 2 * B - 3 * S, 0.22); timpRoll(at(18), at(19, 13), 45, 0.2, 0.6); snareRoll(at(19), at(19, 13), 0.05, 0.35); swell(at(18), 2 * B - 3 * S, 0.55);
                revSwell(at(20), 2.2, [41, 53, 57, 60, 65], 0.45);
                // ---- 20 FLIGHT: the machinery falls away; F major; the strings running, the choir, the ghost soaring
                for (let i = 0; i < 8; i++) {
                    const b = 20 + i;
                    pads(b, T.B_CHORDS[i], 0, { mid: i >= 4, choir: "ah", choirV: 0.16, att: 0.25, rel: 0.7 });
                    arp(b, T.B_CHORDS[i], 0, (t, m, v) => harpNote(t, m, v), 0.24, true, 60);
                    for (const [s, len, c] of halves(T.B_CHORDS[i], 0)) spic(spicc, at(b, s), c.root, 0.45, len * S * 0.9);
                    taiko(at(b), 0.6, true); bigSnare(at(b, 8), 0.45); if (i >= 4) taiko(at(b, 6), 0.35);
                    if (i % 4 === 0) { timpani(at(b), R0(T.B_CHORDS[i]), 0.6); crash(at(b), 0.5); }
                    subs(b, T.B_CHORDS[i], 0.38);
                }
                line(T.B_LEAD, 20, 0, (t, d, m, v) => { ghost(t, d, m, v); brass(horns, t, d, m - 12, v * 0.4, "horn"); }, () => 0.7);
                line(T.B_ANSWER, 20, 0, (t, d, m, v) => celesta(t, m, v, S * 2), () => 0.45);
                line(T.B_COUNTER, 24, 0, (t, d, m, v) => strings(vLo, t, d, m - 12, 0.35, 0.3, 0.6), () => 1, 4, 8);
                // ---- 28 HIGHER: an octave up, trumpets, the choir on the tune
                for (let i = 0; i < 8; i++) {
                    const b = 28 + i;
                    pads(b, T.B_CHORDS[i], 0, { mid: true, choir: "ah", choirV: 0.26, att: 0.1, rel: 0.5 });
                    arp(b, T.B_CHORDS[i], 0, (t, m, v) => spic(trem, t, m + 12, v, 0.1), 0.45, true, 60);
                    for (const [s, len, c] of halves(T.B_CHORDS[i], 0)) for (let k = 0; k < len; k += 2) spic(spicc, at(b, s + k), c.root + (k % 4 === 2 ? 12 : 0), 0.5);
                    taiko(at(b), 0.85, true); taiko(at(b, 6), 0.5); tom(at(b, 10), 0.35); bigSnare(at(b, 8), 0.72); taiko(at(b, 12), 0.45);
                    if (i % 4 === 0) { crash(at(b), 0.7); timpani(at(b), R0(T.B_CHORDS[i]), 0.75); }
                    subs(b, T.B_CHORDS[i], 0.52);
                }
                line(T.B_LEAD, 28, 0, (t, d, m, v) => { ghost(t, d, m + 12, v * 0.85); brass(horns, t, d, m, v * 0.7, "horn"); brass(tpts, t, d, m + 12, v * 0.35, "tpt"); if (d >= S * 4) choir("ah", t, d, m, 0.45, 0.3); }, () => 0.85);
                line(T.B_COUNTER, 28, 0, (t, d, m, v) => { brass(horns, t, d, m, v, "horn"); strings(vLo, t, d, m - 12, 0.4, 0.15, 0.6); }, () => 0.45);
                line(T.B_ANSWER, 28, 12, (t, d, m, v) => celesta(t, m, v, S * 2), () => 0.5);
                snareRoll(at(35, 8), at(36) - 0.05, 0.1, 0.45);
                // ---- 36 THE STALL: the engine slowing, steam let go, the clock alone, the ghost
                for (let i = 0; i < 4; i++) {
                    const b = 36 + i, gap = [2, 4, 8, 16][i];
                    for (let st = 0; st < (i === 3 ? 8 : 16); st += gap) chug(at(b, st), 0.36 - 0.06 * i, st === 0);
                    for (let st = 0; st < 16; st += 4) tick(at(b, st), 0.09);
                    pads(b, T.A_CHORDS[4 + i], 0, { hiLo: 62, att: 1, rel: 1.4, k: 0.5 });
                }
                hiss(at(36), 2.5 * B, 0.2); clank(at(37, 6), 0.3); clank(at(38, 11), 0.22);
                line(T.A_LEAD, 36, 12, (t, d, m, v) => ghost(t, toBar(t, Math.max(d, S * 5)), m, v), () => 0.3, 4, 6);
                revSwell(at(40), 2.4, [38, 50, 57, 62, 65], 0.5);
                // ---- 40 THE CLIMB: driving; the brass climbing twice, the second time with the trumpets up top
                for (let i = 0; i < 8; i++) {
                    const b = 40 + i, str = T.C_CHORDS[i % 4];
                    pads(b, str, 0, { mid: true, choir: i >= 4 ? "ah" : "oo", choirV: 0.2 + 0.02 * i, att: 0.1, rel: 0.5 });
                    machine(b, str, 2, 0.32, 0.14 + 0.01 * i);
                    for (const [s, len, c] of halves(str, 0)) { for (let k = 0; k < len; k++) spic(spicc, at(b, s + k), c.root + (k % 4 === 2 ? 12 : 0), 0.5 + 0.03 * i); for (const k of [2, 6, 10, 14]) if (k < len) for (const m of voice(c.tones, 60)) brass(horns, at(b, s + k), S * 0.8, m, 0.35 + 0.03 * i, "horn"); }
                    taiko(at(b), 0.85, true); taiko(at(b, 4), 0.5); taiko(at(b, 8), 0.7); taiko(at(b, 12), 0.5); bigSnare(at(b, 8), 0.7); if (i >= 4) bigSnare(at(b, 12), 0.4);
                    metal(at(b), 84, 0.3, 0.6); if (i % 4 === 0) { crash(at(b), 0.65); timpani(at(b), R0(str), 0.75); }
                    subs(b, str, 0.5);
                }
                line(T.C_LEAD, 40, 0, (t, d, m, v) => { brass(horns, t, d, m, v, "horn"); ghost(t, d, m, v * 0.5); brass(tbns, t, d, m - 12, v * 0.7, "tbn"); }, () => 0.72);
                line(T.C_LEAD, 44, 0, (t, d, m, v) => { brass(horns, t, d, m, v, "horn"); brass(tpts, t, d, m + 12, v * 0.45, "tpt"); ghost(t, d, m + 12, v * 0.55); brass(tbns, t, d, m - 12, v * 0.7, "tbn"); }, () => 0.82);
                timpRoll(at(47), at(47, 12) - 0.03, 45, 0.3, 0.7); snareRoll(at(47), at(47, 12) - 0.03, 0.1, 0.5); swell(at(47), B - 4 * S, 0.65); hiss(at(47), B - 4 * S, 0.2);
                revSwell(at(48), 2, [41, 53, 57, 60, 65], 0.55);
                // ---- 48 THE LAST FLIGHT: the tune with everything, the machine roaring under it
                for (let i = 0; i < 8; i++) {
                    const b = 48 + i;
                    pads(b, T.B_CHORDS[i], 0, { mid: true, choir: "ah", choirV: 0.36, att: 0.08, rel: 0.5, k: 1.2 });
                    machine(b, T.B_CHORDS[i], 4, 0.3, 0.12);
                    for (const [s, len, c] of halves(T.B_CHORDS[i], 0)) { for (let k = 0; k < len; k += 2) spic(spicc, at(b, s + k), c.root + (k % 4 === 2 ? 12 : 0), 0.7); const ts = voice(c.tones, 67); for (let k = 0; k < len; k++) spic(trem, at(b, s + k), ts[k % ts.length], 0.5, 0.09); }
                    taiko(at(b), 0.95, true); taiko(at(b, 6), 0.62); tom(at(b, 10), 0.42); taiko(at(b, 12), 0.6); bigSnare(at(b, 8), 0.82); tom(at(b, 14), 0.35); tom(at(b, 15), 0.3);
                    if (i % 2 === 0) { crash(at(b), i === 0 ? 0.95 : 0.55); timpani(at(b), R0(T.B_CHORDS[i]), 0.85); }
                    subs(b, T.B_CHORDS[i], 0.62);
                }
                line(T.B_LEAD, 48, 0, (t, d, m, v) => { ghost(t, d, m + 12, v * 0.85); brass(horns, t, d, m, v * 0.75, "horn"); brass(tpts, t, d, m + 12, v * 0.4, "tpt"); if (d >= S * 4) choir("ah", t, d, m, 0.55, 0.3); }, () => 0.98);
                line(T.B_COUNTER, 48, 0, (t, d, m, v) => { brass(tbns, t, d, m - 12, v, "tbn"); strings(vLo, t, d, m - 12, 0.5, 0.1, 0.6); }, () => 0.62);
                line(T.B_ANSWER, 48, 12, (t, d, m, v) => celesta(t, m, v, S * 2), () => 0.55);
                // ---- 56 WINDING DOWN: a held F, the engine slowing to nothing, the last of the steam
                const hold = at(56), hd = 2 * B, FM = halves("F", 0)[0][2];
                for (const m of voice(FM.tones, 65)) { brass(horns, hold, hd, m, 0.85, "horn"); brass(tpts, hold, hd * 0.6, m + 12, 0.5, "tpt"); strings(K.vHi, hold, hd, m + 12, 0.45, 0.05, 2.2); choir("ah", hold, hd, m, 0.5); }
                brass(tbns, hold, hd, 41, 0.8, "tbn"); strings(K.basses, hold, hd + B, 29, 0.6, 0.05, 3); sub(hold, hd + B, 29, 0.5);
                crash(hold, 0.95); taiko(hold, 1, true); timpRoll(hold + 0.05, hold + hd * 0.85, 41, 0.8, 0.25);
                for (const [b, st, v] of [[56, 8, 0.36], [57, 0, 0.32], [57, 8, 0.27], [58, 0, 0.22], [58, 12, 0.18], [59, 8, 0.13]]) chug(at(b, st), v, true);
                hiss(at(58), 1.5 * B, 0.18); clank(at(59, 12), 0.25); ghost(at(58), 1.5 * B, 77, 0.22); glass(at(58), 2 * B, 89, 0.03);
            }
        }
    };
    // a stand-in context, to learn how long a stretch rings before making it for real
    function dummyCtx() {
        const p = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
        const n = () => { const o = { connect() { return o; }, start() {}, stop() {}, frequency: p(), detune: p(), gain: p(), Q: p(), pan: p(), delayTime: p(), playbackRate: p() }; return o; };
        return { createGain: n, createOscillator: n, createBiquadFilter: n, createStereoPanner: n, createWaveShaper: n, createBufferSource: n, createDelay: n, createBuffer: () => ({ getChannelData: () => new Float32Array(1) }) };
    }
    /* THE RECORDINGS (18 Oct 2026): tools/ariadne-editor/samples/, made by tools/ariadne-editor/orchestra.js,
       fetched and decoded once, the first time a version is made. Not there (it is not in git, so not on the
       site, nor in a fresh copy until it is made), and the versions are made from the made sounds. */
    const SAMPLES = "/tools/ariadne-editor/samples/";
    /* How loud each instrument's made sound was against its recordings, dynamic by dynamic (soft first): the same
       notes, across its range, at the same level, the made over the recorded by their RMS (measured 18 Oct 2026,
       RatEpic._probe, at the hook's fullness). So each part sits in the score's balance as it did, and a part
       played harder changes its sound (the louder recording) without jumping in level. The gong, not in the
       made orchestra, has nothing to measure against: set to sit under the cymbal it is struck with. */
    const CAL = {
        // (measured again 19 Oct 2026: the recordings cleaned of their hiss, played as sections, the strings' tone opened)
        violins: [4.33, 3.8], violas: [8.08, 4.76], cellos: [7.12, 2.66], basses: [4.54, 3.86], violinSpic: 1.67, celloSpic: 1.68,
        horns: [2.19, 2.16, 2.24], trumpets: [6.18, 1.96], trombones: [8.43, 3.27], tuba: [13.19, 4.27],
        piano: [10.09, 7.11], flute: 3.15, oboe: [1.11, 1.83],
        timpani: [4.42, 3.09], timpRoll: 1.59, harp: 3.61, glock: 2.18,
        snare: [6.8, 0.86], snareRoll: 0.55, cymbal: [2.76, 1.43], cymSwell: 0.5, gong: 0.8, bassDrum: [2.06, 2.14, 1.67]
    };
    let bankJob = null;
    function loadBank() {
        return bankJob || (bankJob = (async () => {
            try {
                const r = await fetch(SAMPLES + "manifest.json", { cache: "no-store" });
                if (!r.ok) return null;
                const man = await r.json(), dec = new OfflineAudioContext(1, 1, SR), bank = { cal: CAL };
                await Promise.all(Object.entries(man.instruments).map(async ([k, list]) => {
                    const notes = await Promise.all(list.map(async e => {
                        const buf = await dec.decodeAudioData(await (await fetch(SAMPLES + e.f)).arrayBuffer());
                        // where it is loudest (a cymbal's crescendo: its peak, which the downbeat is put on)
                        const d = buf.getChannelData(0); let pk = 0, at = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) { pk = a; at = i; } }
                        return { buf, m: e.m, cents: e.cents || 0, layer: e.layer, len: buf.duration, peak: at / buf.sampleRate, rms: e.rms, norm: 1 };
                    }));
                    const layers = 1 + Math.max(...notes.map(n => n.layer));
                    /* each note to its dynamic's middling level (the library's notes were not all recorded at one gain:
                       the horn's two highest, at its softest, thirty times its others); a cymbal's crescendos are left be */
                    if (k !== "cymSwell") for (let l = 0; l < layers; l++) {
                        const mine = notes.filter(n => n.layer === l && n.rms > 0), rs = mine.map(n => n.rms).sort((a, b) => a - b), mid = rs[rs.length >> 1];
                        for (const n of mine) n.norm = Math.max(0.1, Math.min(10, mid / n.rms));
                    }
                    // the level each dynamic is the recording of (soft, loud; or soft, middling, loud)
                    const ref = k === "cymSwell" ? [0.6, 0.6, 0.6] : layers === 1 ? [0.6] : layers === 2 ? [0.3, 0.75] : [0.2, 0.5, 0.85];
                    bank[k] = { notes, layers, ref };
                }));
                return bank;
            } catch (e) { return null; }
        })());
    }
    // a version: which score, and whether it is played on the recordings ("-made": the made sounds, as it was)
    function versionOf(kind, bank) {
        const made = /-made$/.test(kind), base = kind.replace(/-made$/, ""), song = SONGS[base];
        const V = song ? { hybrid: true, song: base } : { hybrid: base === "hybrid", orch: base === "orchestral", trailer: base === "trailer" };
        if (song) useSong(song.bpm, song.bars, song.shape); else useSong(92, 78, MINE_SHAPE, 4);
        if (bank && !made) V.bank = bank;
        return V;
    }
    const SEG = 4;   // bars to a stretch
    // (one render at a time: the tempo and the shape are the song's while it is made)
    let queue = Promise.resolve();
    // (giveUp: asked between stretches; true, the making stops, rejected with .given)
    function render(kind, progress, giveUp) { const job = queue.then(() => renderNow(kind, progress, giveUp)); queue = job.catch(() => {}); return job; }
    async function renderNow(kind, progress, giveUp) {
        const bank = /-made$/.test(kind) ? null : await loadBank();
        const V = versionOf(kind, bank);
        const total = BARS * BAR + TAIL, N = Math.ceil(total * SR);
        // the dry sound and what goes to the hall, each stereo, the whole length
        const stem = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(N));
        const pieces = Math.ceil(BARS / SEG);
        for (let k = 0; k < pieces; k++) {
            if (giveUp && giveUp()) throw Object.assign(new Error("given up"), { given: true });
            const seg ={ a: k * SEG * BAR, b: Math.min(BARS, (k + 1) * SEG) * BAR, max: 0 };
            const probe = Object.assign({}, seg); score(dummyCtx(), V, probe, dummyCtx().createGain(), dummyCtx().createGain(), dummyCtx().createGain());
            const len = Math.max(seg.b - seg.a, probe.max) + 0.2, ctx = new OfflineAudioContext(6, Math.ceil(len * SR), SR);
            ctx.destination.channelCount = 6; ctx.destination.channelInterpretation = "discrete";
            const merge = ctx.createChannelMerger(6); merge.connect(ctx.destination);
            const dry = ctx.createGain(), wet = ctx.createGain(), big = ctx.createGain();
            for (const [g, ch] of [[dry, 0], [wet, 2], [big, 4]]) { const sp = ctx.createChannelSplitter(2); g.connect(sp); sp.connect(merge, 0, ch); sp.connect(merge, 1, ch + 1); }
            score(ctx, V, seg, dry, wet, big);
            const out = await ctx.startRendering(), off = Math.round(seg.a * SR);
            for (let ch = 0; ch < 6; ch++) { const d = out.getChannelData(ch), S = stem[ch]; for (let i = 0; i < d.length && off + i < N; i++) S[off + i] += d[i]; }
            if (progress) progress((k + 1) / (pieces + 1));
        }
        // the hall and the master, over the whole
        const ctx = new OfflineAudioContext(2, N, SR);
        const src = ctx.createBufferSource(), b6 = ctx.createBuffer(6, N, SR); for (let ch = 0; ch < 6; ch++) b6.getChannelData(ch).set(stem[ch]); src.buffer = b6;
        const sp = ctx.createChannelSplitter(6); src.connect(sp);
        const dryM = ctx.createChannelMerger(2), wetM = ctx.createChannelMerger(2), bigM = ctx.createChannelMerger(2);
        sp.connect(dryM, 0, 0); sp.connect(dryM, 1, 1); sp.connect(wetM, 2, 0); sp.connect(wetM, 3, 1); sp.connect(bigM, 4, 0); sp.connect(bigM, 5, 1);
        const mix = ctx.createGain(); mix.gain.value = 0.5;
        /* (19 Oct 2026) the recorded orchestra's strokes (a real snare's, a cymbal's) are sharper than the made
           ones, so the whole was being brought down for them and lost its weight: driven a little harder into the
           limiter, through a gentle saturation first (a tape's, rounding the peaks and thickening the low end) */
        const sat = V.bank ? ctx.createWaveShaper() : null;
        if (sat) { mix.gain.value = V.song === "steam" ? 0.5 : 0.58;   // (the Steamworks' peaks are the densest: driven as hard, they measured 8 dB from peak to average, squashed)
             const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.15 * x) / Math.tanh(1.15); } sat.curve = c; sat.oversample = "2x"; }
        /* the depth moving with the music: the dry sound further back in the quiet parts (the halls stay), and
           the top taken off the whole as it falls quiet, opened as it grows */
        const near = ctx.createGain(), air = ctx.createBiquadFilter(); air.type = "lowpass"; air.Q.value = 0.3;
        for (let b = 0; b <= BARS + 2; b += 0.25) { const k = shapeAt(Math.min(BARS, b) * BAR); near.gain.setValueAtTime(0.55 + 0.45 * k, b * BAR); air.frequency.setValueAtTime(4200 + 15000 * Math.pow(k, 1.4), b * BAR); }
        /* (20 Oct 2026, the owner's: "it must be the best possible quality you can make it, feeling like a truly
           professionally mastered orchestral epic soundtrack") the master's EQ, for the recorded versions, as a
           mastering engineer would set it: the rumble under the double basses' lowest note cut away; a little out
           of the low middle, where a full orchestra and its halls pile up into mud; and a lift to the air on top */
        if (V.bank) {
            const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 28; hp.Q.value = 0.7;
            const mud = ctx.createBiquadFilter(); mud.type = "peaking"; mud.frequency.value = 320; mud.Q.value = 0.8; mud.gain.value = -2.5;
            const top = ctx.createBiquadFilter(); top.type = "highshelf"; top.frequency.value = 9500; top.gain.value = 2;
            mix.connect(hp); hp.connect(mud); mud.connect(top); top.connect(air);
        } else mix.connect(air);
        const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -12; glue.knee.value = 10; glue.ratio.value = 1.8; glue.attack.value = 0.03; glue.release.value = 0.3;
        const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.12;
        if (sat) { air.connect(sat); sat.connect(glue); } else air.connect(glue); glue.connect(limit); limit.connect(ctx.destination);
        const verb = ctx.createConvolver(); verb.buffer = hall(ctx, V.trailer ? 4.2 : 3.6, undefined, Boolean(V.bank));
        const verbOut = ctx.createGain(); verbOut.gain.value = V.trailer ? 0.7 : 0.62;
        const pre = ctx.createDelay(0.2); pre.delayTime.value = 0.03;
        dryM.connect(near); near.connect(mix); pre.connect(verb); verb.connect(verbOut); verbOut.connect(mix);
        /* (20 Oct 2026, the owner's: "During the bigger parts ... lots of overlapping sustain ... the track loses
           control of itself") the halls, for the recorded versions: the low end kept out of them (a hall's lows only
           muddy, and the players' own are there already), and their level stepping back as the music fills, so the
           big parts are close and clear, and the quiet ones keep their space */
        let wetIn = wetM, bigIn2 = bigM;
        if (V.bank) {
            const h1 = ctx.createBiquadFilter(); h1.type = "highpass"; h1.frequency.value = 220; h1.Q.value = 0.6; wetM.connect(h1); wetIn = h1;
            const h2 = ctx.createBiquadFilter(); h2.type = "highpass"; h2.frequency.value = 320; h2.Q.value = 0.6; bigM.connect(h2); bigIn2 = h2;
        }
        wetIn.connect(pre);
        // the plate: long and bright, for the snare, the ghost and the eerie things
        const plate = ctx.createConvolver(); plate.buffer = hall(ctx, 6.5, 0.45); const plateOut = ctx.createGain(); plateOut.gain.value = 0.55; const pre2 = ctx.createDelay(0.2); pre2.delayTime.value = 0.045;
        bigIn2.connect(pre2); pre2.connect(plate); plate.connect(plateOut); plateOut.connect(mix);
        if (V.bank) for (let b = 0; b <= BARS + 2; b += 0.25) { const k = shapeAt(Math.min(BARS, b) * BAR); verbOut.gain.setValueAtTime((V.trailer ? 0.7 : 0.62) * (1 - 0.38 * k), b * BAR); plateOut.gain.setValueAtTime(0.55 * (1 - 0.5 * k), b * BAR); }
        src.start(0);
        const buf = await ctx.startRendering();
        if (progress) progress(1);
        // the whole brought up to just under full
        let peak = 0; for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
        const g = peak > 0 ? 0.92 / peak : 1;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= g; }
        return buf;
    }

    /* ---- KEPT ONES (22 Oct 2026, the owner's: "make it so these load quicker in the editor when first listening
       to them"). Making a version takes half a minute, so once made it is kept by the editor's server as a WAV
       (/api/epic, tools/ariadne-editor/epic-cache/), under a key of this file's text and the recordings' list: the
       score or the recordings changed, the key changes and it is made again. And a few seconds after the editor
       opens, the versions not kept yet are made quietly, one at a time (warm). */
    const SELF = document.currentScript ? document.currentScript.src : "/js/rat-race-epic.js";
    let keyJob = null;
    function cacheKey() {
        return keyJob || (keyJob = (async () => {
            const text = async u => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.text() : ""; } catch (e) { return ""; } };
            const s = (await text(SELF)) + "\n" + (await text(SAMPLES + "manifest.json"));
            // two FNV-1a hashes of it, side by side
            let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
            for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15); }
            return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
        })().catch(() => null));
    }
    function toWav(buf) {
        const ch = buf.numberOfChannels, n = buf.length, out = new ArrayBuffer(44 + n * ch * 2), v = new DataView(out);
        const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        str(0, "RIFF"); v.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
        v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * ch * 2, true);
        const d = [...Array(ch).keys()].map(c => buf.getChannelData(c)), pcm = new Int16Array(out, 44);
        for (let i = 0, j = 0; i < n; i++) for (let c = 0; c < ch; c++, j++) { const x = Math.max(-1, Math.min(1, d[c][i])); pcm[j] = x < 0 ? x * 0x8000 : x * 0x7fff; }
        return out;
    }
    async function kept(id, ctx) {
        const key = await cacheKey(); if (!key) return null;
        try { const r = await fetch("/api/epic?id=" + id + "&key=" + key, { cache: "no-store" }); return r.ok ? await ctx.decodeAudioData(await r.arrayBuffer()) : null; } catch (e) { return null; }
    }
    async function keep(id, buf) {
        const key = await cacheKey(); if (!key) return;
        try { await fetch("/api/epic?id=" + id + "&key=" + key, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: toWav(buf) }); } catch (e) { /* made again next time */ }
    }
    // a version: its kept one, or made (and kept); the one being made in the background already, waited for
    async function fetchOrMake(id, ctx, progress) {
        if (warmNow && warmNow.id === id) { warmNow.show = progress; progress(warmNow.at); await warmNow.job.catch(() => {}); }
        const k = await kept(id, ctx); if (k) return k;
        const buf = await render(id, progress); keep(id, buf); return buf;
    }
    let warming = null, warmNow = null;
    /* the versions not kept yet, made one at a time while nothing else is (paused: wait() true, e.g. while a
       passage is tested); each is sent to be kept and let go of, not held. Another version asked for while one is
       made: that one is given up (made again after), so what was asked for is not kept waiting behind it */
    function warm(wait) {
        return warming || (warming = (async () => {
            const key = await cacheKey(); if (!key) return;
            let have = [];
            try { const r = await fetch("/api/epic?key=" + key, { cache: "no-store" }); if (!r.ok) return; have = (await r.json()).kept || []; } catch (e) { return; }
            const todo = window.RatEpic.versions.map(v => v.id).filter(id => !have.includes(id));
            while (todo.length) {
                while (making || (wait && wait())) await new Promise(r => setTimeout(r, 1000));
                const id = todo[0];
                if (made[id]) { todo.shift(); continue; }
                const me = warmNow = { id, at: 0, show: null };
                me.job = render(id, p => { me.at = p; if (me.show) me.show(p); }, () => making && making !== id || (wait && wait() && !making)).then(buf => keep(id, buf));
                try { await me.job; todo.shift(); } catch (e) { if (!(e && e.given)) todo.shift(); }
                warmNow = null;
            }
        })().finally(() => { warming = null; }));
    }

    // ---- playing it (the editor's jukebox): made once for each version (or its kept one), then round and round
    const made = {};
    let live = null, src = null, now = null, making = null, made01 = 0;
    function stop() { making = null; if (src) { try { src.stop(); } catch (e) { /* done */ } src = null; } now = null; }
    async function play(id, opts) {
        stop();
        making = id;
        made01 = 0;
        if (!live) live = new (window.AudioContext || window.webkitAudioContext)();
        const buf = await (made[id] || (made[id] = fetchOrMake(id, live, p => { if (making === id) made01 = p; })));
        if (making !== id) return false;
        making = null;
        if (live.state !== "running") await live.resume();
        src = live.createBufferSource(); src.buffer = buf; src.loop = !(opts && opts.loop === false);
        const g = live.createGain(); g.gain.value = 0.85; src.connect(g); g.connect(live.destination);
        const me = src; src.onended = () => { if (src === me) { src = null; now = null; } };
        src.start(); now = id;
        return true;
    }
    window.RatEpic = {
        _score: (kind, log) => { const V = versionOf(kind, null); const d = dummyCtx(); score(d, V, { a: 0, b: 1e9, max: 0, log }, d.createGain(), d.createGain(), d.createGain()); },
        versions: [{ id: "hybrid", name: "Mine Labyrinth: epic, hybrid" }, { id: "orchestral", name: "Mine Labyrinth: epic, orchestral" }, { id: "trailer", name: "Mine Labyrinth: epic, trailer" }, { id: "dark", name: "Dark Depths: epic" }, { id: "steam", name: "Steamworks Factory: epic" },
            // (18 Oct 2026) each as it was before the recordings: its orchestra made from oscillators and noise
            { id: "hybrid-made", name: "Mine Labyrinth: epic, hybrid (made sounds)" }, { id: "orchestral-made", name: "Mine Labyrinth: epic, orchestral (made sounds)" }, { id: "trailer-made", name: "Mine Labyrinth: epic, trailer (made sounds)" },
            { id: "dark-made", name: "Dark Depths: epic (made sounds)" }, { id: "steam-made", name: "Steamworks Factory: epic (made sounds)" }],
        loadBank, _cal: CAL,
        /* the dev server's measure of one instrument: fn(I) plays it (I: the instruments and the buses), made or
           recorded, into a dry context of secs; gives the samples (the hall and the master left out) */
        _probe: async (fn, secs, recorded, from) => {
            const bank = recorded ? await loadBank() : null, V = versionOf("orchestral", bank); V.probe = fn; V.calibrating = true;
            const ctx = new OfflineAudioContext(2, Math.ceil(secs * SR), SR), mix = ctx.createGain(); mix.connect(ctx.destination);
            score(ctx, V, { a: from || 0, b: (from || 0) + secs, max: 0 }, mix, ctx.createGain(), ctx.createGain());
            return ctx.startRendering();
        },
        play, stop, render, warm,
        get playing() { return now; },
        get preparing() { return making; },
        get progress() { return made01; },
        length: BARS * BAR + TAIL
    };
})();

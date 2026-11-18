/* THE GTA SKIN'S OWN TUNES (19 Nov 2026, the owner's: Pink Palms and
   Neon 108 "a cool, upbeat 80s synthwave type track", and a new station,
   The Bog Signal, "playing jungle themed music"). REMADE THE SAME DAY as
   AMBIENT synthwave (the owner's, on the first cut: "horrible snare ...
   overly loud drums and bass ... high quality only please. ambient 80s
   synthwave"): no gated snare, no pumping bass; the pads and the tune in
   front, the drums soft and far back, slower, and the top end rolled off.
   AND THEN (the owner's, the same day): "a subtle sense of being upbeat
   and pop, with over arching ambient layers", and nothing taken from
   Fallin' Furni's or Scout's Trail's music: every station is these songs,
   each one written here. A light pop groove (a soft clap on two and four,
   a moving bassline, chord stabs) under pads that float over everything.

     FOLK     plucked guitar strums, a cajon and shaker, a whistle and a
              fiddle, for Quarry Folk.
     CHIP     soft-edged pulse leads, a quick arpeggio and a triangle bass,
              for Pixel FM (once Fallin' FM).

   A small synth of its own, played live, nothing to fetch: every song is
   a chord progression and two hand-written melodies (an A and a B), laid
   out by its style into intro, verses, a break and back round.

     SYNTH    wide chorused pads that swell, a warm held bass, a mellow
              arpeggio in eighths into a long echo, a soft filtered lead (or
              a gentle DX-style bell for the sunny ones), and under it all a
              half-time beat kept quiet: a round kick with no click, a dark
              soft snare in a big hall, hats you only just hear.
     JUNGLE   congas, bongos, a log drum, a shaker; a round wooden bass; a
              marimba ostinato and a breathy flute; and the swamp itself:
              insects humming, birds now and then, frogs.

   GtaTunes.play(id) starts a song from its top (the one playing fades),
   stop(fade), pause(), resume(); GtaTunes.SONGS lists them. Used by
   js/gta-radio.js. On the dev server, GtaTunes._render(id, seconds) makes
   it offline, for previews and for measuring the levels. */
(function () {
    "use strict";

    /* ---------------------------------------------------------------
       THE SONGS. Notes as "a4/4": the note and its length in sixteenths;
       "r/4" a rest. A line shorter than its section repeats. */
    const SONGS = [
        { id: "midnight", name: "Midnight Drive", style: "synth", bpm: 100, bass: "pulse", lead: "saw",
            A: [["A", "m"], ["F", "M"], ["C", "M"], ["G", "M"]], B: [["A", "m"], ["F", "M"], ["C", "M"], ["G", "M"]],
            mA: "e5/6 d5/2 c5/4 b4/4 | c5/6 a4/2 a4/8 | e5/4 g5/4 e5/4 d5/4 | d5/6 b4/2 g4/8 | e5/6 d5/2 c5/4 e5/4 | a5/6 g5/2 f5/4 e5/4 | g5/4 e5/4 c5/4 e5/4 | d5/12 r/4",
            mB: "a5/4 a5/2 g5/2 a5/4 c6/4 | c6/4 a5/4 f5/4 a5/4 | g5/4 g5/2 e5/2 g5/4 c6/4 | b5/8 d6/8 | a5/4 a5/2 g5/2 a5/4 e6/4 | d6/4 c6/4 a5/4 f5/4 | g5/4 c6/4 e6/4 g6/4 | d6/8 b5/8" },
        { id: "neonrain", name: "Neon Rain", style: "synth", bpm: 96, bass: "pulse", lead: "saw",
            A: [["E", "m"], ["C", "M"], ["G", "M"], ["D", "M"]], B: [["C", "M"], ["D", "M"], ["E", "m"], ["E", "m"]],
            mA: "b4/4 e5/2 g5/2 b5/4 a5/2 g5/2 | g5/6 e5/2 c5/8 | d5/4 g5/2 b5/2 d6/4 b5/4 | a5/12 f#5/4 | g5/4 f#5/2 e5/2 b4/8 | c5/4 e5/4 g5/4 e5/4 | d5/4 b4/4 g4/4 b4/4 | a4/16",
            mB: "e5/2 g5/2 c6/4 b5/4 g5/4 | a5/2 f#5/2 d5/4 f#5/4 a5/4 | b5/8 g5/4 e5/4 | e5/12 r/4 | e6/4 d6/4 c6/4 g5/4 | f#5/4 a5/4 d6/4 a5/4 | g5/4 b5/4 e6/8 | e6/12 r/4" },
        { id: "turbo", name: "Turbo Sunset", style: "synth", bpm: 104, bass: "octave", lead: "saw",
            A: [["D", "m"], ["A#", "M"], ["F", "M"], ["C", "M"]], B: [["G", "m"], ["A#", "M"], ["F", "M"], ["A", "M"]],
            mA: "a4/2 d5/2 f5/2 a5/2 g5/4 f5/4 | f5/4 d5/4 a#4/8 | c5/2 f5/2 a5/2 c6/2 a5/4 f5/4 | g5/8 e5/8 | d5/4 f5/4 a5/4 d6/4 | c6/4 a#5/4 f5/8 | a5/4 g5/4 f5/4 a5/4 | g5/16",
            mB: "d6/4 a#5/4 g5/4 a#5/4 | f5/4 a#5/4 d6/8 | c6/4 a5/4 f5/4 a5/4 | e5/4 a5/4 c#6/8 | d6/2 d6/2 a#5/4 g5/4 d5/4 | f5/2 g5/2 a#5/4 d6/8 | c6/4 a5/4 c6/4 f6/4 | e6/8 c#6/8" },
        { id: "ocean", name: "Ocean Drive", style: "synth", bpm: 108, bass: "octave", lead: "bell", sunny: true,
            A: [["C", "M"], ["A", "m"], ["F", "M"], ["G", "M"]], B: [["F", "M"], ["G", "M"], ["E", "m"], ["A", "m"]],
            mA: "e5/4 g5/4 c6/4 g5/4 | a5/6 g5/2 e5/8 | f5/4 a5/4 c6/4 a5/4 | g5/6 d5/2 b4/8 | e5/2 f5/2 g5/4 c6/4 e6/4 | d6/4 c6/4 a5/8 | a5/4 c6/4 f6/4 e6/4 | d6/16",
            mB: "c6/4 a5/4 f5/4 a5/4 | b5/4 g5/4 d6/8 | b5/4 g5/4 e5/4 g5/4 | a5/12 r/4 | c6/2 c6/2 a5/4 c6/4 f6/4 | d6/4 b5/4 g5/4 d6/4 | e6/4 d6/4 b5/4 g5/4 | a5/8 c6/8" },
        { id: "pastel", name: "Pastel Skyline", style: "synth", bpm: 102, bass: "octave", lead: "saw", sunny: true,
            A: [["G", "M"], ["D", "M"], ["E", "m"], ["C", "M"]], B: [["C", "M"], ["D", "M"], ["B", "m"], ["E", "m"]],
            mA: "d5/4 g5/4 b5/4 a5/4 | f#5/6 a5/2 d6/8 | e6/4 d6/4 b5/4 g5/4 | e5/8 g5/8 | b5/2 a5/2 g5/4 d5/4 g5/4 | a5/4 f#5/4 a5/4 d6/4 | b5/6 a5/2 g5/4 e5/4 | g5/16",
            mB: "e6/4 d6/4 c6/4 g5/4 | f#5/4 a5/4 d6/8 | d6/4 b5/4 f#5/4 b5/4 | g5/12 r/4 | c6/2 d6/2 e6/4 g6/4 e6/4 | d6/4 a5/4 f#5/4 a5/4 | b5/4 d6/4 f#6/8 | e6/16" },
        { id: "cruise", name: "Sunset Cruise", style: "synth", bpm: 106, bass: "pulse", lead: "bell", sunny: true,
            A: [["F", "M"], ["C", "M"], ["D", "m"], ["A#", "M"]], B: [["A#", "M"], ["C", "M"], ["A", "m"], ["D", "m"]],
            mA: "c5/4 f5/4 a5/4 c6/4 | e5/4 g5/4 c6/8 | d6/4 c6/4 a5/4 f5/4 | f5/4 g5/4 a#5/8 | a5/2 a#5/2 c6/4 a5/4 f5/4 | g5/6 e5/2 c5/8 | d5/4 f5/4 a5/4 d6/4 | c6/8 a#5/8",
            mB: "d6/4 f6/4 d6/4 a#5/4 | c6/4 e6/4 g6/8 | e6/4 c6/4 a5/4 c6/4 | d6/12 r/4 | f6/4 d6/4 a#5/4 d6/4 | e6/4 c6/4 g5/4 e5/4 | a5/4 c6/4 e6/4 a6/4 | f6/8 d6/8" },
        { id: "mangrove", name: "Mangrove Drums", style: "jungle", bpm: 104,
            A: [["D", "m"], ["D", "m"], ["C", "M"], ["A", "m"]], B: [["D", "m"], ["D", "m"], ["C", "M"], ["A", "m"]],
            mA: "d5/2 f5/2 a5/2 d5/2 c5/2 a4/2 g4/2 a4/2 | d5/2 f5/2 g5/2 a5/2 g5/2 f5/2 d5/4",
            mB: "a5/8 g5/4 f5/4 | d5/12 r/4 | f5/4 g5/4 a5/4 c6/4 | a5/16 | d6/8 c6/4 a5/4 | g5/8 f5/8 | d5/4 f5/4 g5/4 f5/4 | d5/16" },
        { id: "frogs", name: "Frog Chorus", style: "jungle", bpm: 98, frogs: true,
            A: [["E", "m"], ["E", "m"], ["G", "M"], ["D", "M"]], B: [["E", "m"], ["E", "m"], ["G", "M"], ["D", "M"]],
            mA: "e5/2 g5/2 b5/2 e5/2 d5/2 b4/2 a4/2 b4/2 | g4/2 b4/2 d5/2 g4/2 a4/2 b4/2 d5/4",
            mB: "b5/8 a5/4 g5/4 | e5/16 | g5/4 a5/4 b5/4 d6/4 | b5/12 r/4 | e6/8 d6/4 b5/4 | a5/8 g5/8 | e5/4 g5/4 a5/4 g5/4 | e5/16" },
        { id: "canopy", name: "Canopy Run", style: "jungle", bpm: 110,
            A: [["A", "m"], ["A", "m"], ["G", "M"], ["E", "m"]], B: [["A", "m"], ["A", "m"], ["G", "M"], ["E", "m"]],
            mA: "a4/2 c5/2 e5/2 a5/2 g5/2 e5/2 d5/2 c5/2 | d5/2 e5/2 g5/2 e5/2 d5/2 c5/2 a4/4",
            mB: "e6/4 d6/4 c6/4 a5/4 | g5/8 e5/8 | a5/4 c6/4 d6/4 e6/4 | g6/12 r/4 | e6/4 g6/4 e6/4 d6/4 | c6/8 a5/8 | g5/4 a5/4 c6/4 d6/4 | a5/16" }
    ];
    SONGS.push(
        // QUARRY FOLK: folk-pop
        { id: "lanterns", name: "Hillside Lanterns", style: "folk", bpm: 104,
            A: [["G", "M"], ["D", "M"], ["E", "m"], ["C", "M"]], B: [["C", "M"], ["G", "M"], ["D", "M"], ["E", "m"]],
            mA: "d5/4 g5/4 g5/2 a5/2 b5/4 | a5/6 f#5/2 d5/8 | e5/4 g5/4 b5/2 a5/2 g5/4 | e5/12 r/4 | d5/2 g5/2 b5/4 d6/4 b5/4 | a5/4 f#5/4 a5/4 d6/4 | b5/4 a5/2 g5/2 e5/8 | g5/12 r/4",
            mB: "e6/6 d6/2 c6/4 g5/4 | d6/8 b5/8 | a5/4 d6/4 f#6/4 e6/4 | e6/12 r/4 | c6/2 d6/2 e6/4 g6/4 e6/4 | d6/6 b5/2 g5/8 | a5/4 b5/4 d6/4 f#5/4 | e5/16" },
        { id: "riverstone", name: "Riverstone", style: "folk", bpm: 100,
            A: [["D", "M"], ["A", "M"], ["B", "m"], ["G", "M"]], B: [["G", "M"], ["A", "M"], ["F#", "m"], ["B", "m"]],
            mA: "a4/4 d5/4 f#5/4 e5/4 | e5/6 c#5/2 a4/8 | b4/4 d5/4 f#5/4 b5/4 | a5/8 g5/8 | f#5/2 g5/2 a5/4 d6/4 a5/4 | c#6/4 b5/4 a5/4 e5/4 | f#5/6 e5/2 d5/4 b4/4 | d5/16",
            mB: "b5/4 d6/4 g6/4 d6/4 | c#6/6 a5/2 e5/8 | f#5/4 a5/4 c#6/4 a5/4 | b5/12 r/4 | g6/4 f#6/4 d6/4 b5/4 | a5/4 c#6/4 e6/4 c#6/4 | c#6/6 a5/2 f#5/4 a5/4 | b5/16" },
        { id: "oldmill", name: "Old Mill Road", style: "folk", bpm: 108,
            A: [["A", "m"], ["G", "M"], ["F", "M"], ["E", "M"]], B: [["F", "M"], ["C", "M"], ["G", "M"], ["A", "m"]],
            mA: "e5/4 a5/4 a5/2 b5/2 c6/4 | b5/6 g5/2 d5/8 | c5/4 f5/4 a5/4 g5/4 | g#5/12 r/4 | a5/2 b5/2 c6/4 e6/4 c6/4 | d6/4 b5/4 g5/4 b5/4 | a5/6 g5/2 f5/4 e5/4 | e5/16",
            mB: "a5/4 c6/4 f6/4 e6/4 | e6/6 c6/2 g5/8 | g5/4 b5/4 d6/4 b5/4 | a5/12 r/4 | f6/4 e6/4 c6/4 a5/4 | g5/4 c6/4 e6/4 g6/4 | d6/6 b5/2 g5/4 b5/4 | a5/16" },
        // PIXEL FM: chip-pop
        { id: "parade", name: "Pixel Parade", style: "chip", bpm: 112,
            A: [["C", "M"], ["G", "M"], ["A", "m"], ["F", "M"]], B: [["F", "M"], ["G", "M"], ["E", "m"], ["A", "m"]],
            mA: "g5/2 g5/2 e5/2 g5/2 c6/4 g5/4 | b5/4 a5/2 g5/2 d5/8 | e5/2 a5/2 c6/2 a5/2 e6/4 c6/4 | a5/8 f5/8 | c6/2 c6/2 g5/2 c6/2 e6/4 d6/4 | d6/4 b5/4 g5/4 b5/4 | c6/2 b5/2 a5/4 e5/4 a5/4 | f5/12 r/4",
            mB: "a5/4 c6/4 f6/4 c6/4 | b5/4 d6/4 g6/8 | g6/2 f6/2 e6/4 b5/4 g5/4 | a5/12 r/4 | f6/2 e6/2 c6/4 a5/4 c6/4 | d6/4 g6/4 d6/4 b5/4 | e6/4 b5/4 g5/4 b5/4 | a5/16" },
        { id: "fountain", name: "Coin Fountain", style: "chip", bpm: 108,
            A: [["F", "M"], ["D", "m"], ["A#", "M"], ["C", "M"]], B: [["A#", "M"], ["C", "M"], ["A", "m"], ["D", "m"]],
            mA: "c6/4 a5/2 c6/2 f6/4 c6/4 | d6/6 a5/2 f5/8 | d6/4 a#5/4 f5/4 a#5/4 | c6/8 g5/8 | a5/2 a#5/2 c6/4 a5/4 f5/4 | f5/4 a5/4 d6/4 a5/4 | a#5/6 a5/2 g5/4 f5/4 | e5/12 r/4",
            mB: "f6/4 d6/4 a#5/4 d6/4 | e6/4 g6/4 e6/8 | c6/4 e6/4 a6/4 e6/4 | d6/12 r/4 | d6/2 f6/2 a#6/4 f6/4 d6/4 | c6/4 e6/4 g6/4 e6/4 | a5/4 c6/4 e6/4 c6/4 | d6/16" },
        { id: "nightbus", name: "Night Bus Home", style: "chip", bpm: 100,
            A: [["E", "m"], ["C", "M"], ["G", "M"], ["D", "M"]], B: [["A", "m"], ["C", "M"], ["G", "M"], ["B", "M"]],
            mA: "g5/4 b5/4 e6/4 d6/4 | c6/6 g5/2 e5/8 | d5/4 g5/4 b5/4 a5/4 | f#5/12 r/4 | e5/2 f#5/2 g5/4 b5/4 e6/4 | e6/4 d6/4 c6/4 g5/4 | b5/6 a5/2 g5/4 d5/4 | a5/16",
            mB: "c6/4 e6/4 a6/4 e6/4 | g6/6 e6/2 c6/8 | d6/4 g6/4 b6/4 g6/4 | f#6/12 r/4 | e6/2 d6/2 c6/4 a5/4 c6/4 | e6/4 g6/4 e6/4 c6/4 | d6/6 b5/2 g5/4 b5/4 | d#6/16" }
    );
    const FORMS = {
        synth: [["intro", 8], ["A", 8], ["B", 8], ["break", 8], ["A", 8], ["B", 8]],
        jungle: [["intro", 4], ["A", 8], ["B", 8], ["break", 4], ["A", 8], ["B", 8]],
        folk: [["intro", 4], ["A", 8], ["B", 8], ["break", 4], ["A", 8], ["B", 8]],
        chip: [["intro", 4], ["A", 8], ["B", 8], ["break", 4], ["A", 8], ["B", 8]]
    };

    // ---- reading the notation
    const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    const midi = (n) => { const m = /^([a-g])(#|b)?(\d)$/i.exec(n); return m ? 12 * (Number(m[3]) + 1) + PC[m[1].toLowerCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) : null; };
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function line(s) {
        const out = []; let at = 0;
        String(s).replace(/\|/g, " ").trim().split(/\s+/).forEach((tok) => {
            const [n, len] = tok.split("/"), L = Number(len) || 4;
            if (n !== "r") out.push({ at, m: midi(n), len: L });
            at += L;
        });
        return { notes: out, steps: at };
    }
    const chordRoot = (name) => midi(name.toLowerCase() + "2");
    const chordNotes = ([name, q]) => { const r = chordRoot(name); return [r, r + (q === "m" ? 3 : 4), r + 7]; };
    const parsed = {};
    function song(id) {
        if (parsed[id]) return parsed[id];
        const s = SONGS.find((x) => x.id === id) || SONGS[0];
        const form = FORMS[s.style], bars = [];
        form.forEach(([sec, n]) => { for (let i = 0; i < n; i++) bars.push({ sec, i, n }); });
        return (parsed[id] = Object.assign({}, s, { lA: line(s.mA), lB: line(s.mB), bars, step: 60 / s.bpm / 4 }));
    }

    /* ---------------------------------------------------------------
       THE SOUND: one graph per audio context (the live one, or an
       offline one for a render). */
    function noiseBuf(ctx, secs) {
        const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return b;
    }
    function impulse(ctx, secs, decay, gated) {
        const n = Math.ceil(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = b.getChannelData(c);
            for (let i = 0; i < n; i++) {
                const t = i / n;
                d[i] = (Math.random() * 2 - 1) * (gated ? (t < 0.85 ? 0.7 : (1 - t) / 0.15 * 0.7) : Math.pow(1 - t, decay));
            }
        }
        return b;
    }
    function graph(ctx) {
        const G = { ctx };
        G.master = ctx.createGain(); G.master.gain.value = 0;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.2;
        G.bus = ctx.createGain(); G.bus.gain.value = 0.8;
        // Warm: nothing harsh up top, and the very bottom kept out of the way.
        const top = ctx.createBiquadFilter(); top.type = "lowpass"; top.frequency.value = 8500; top.Q.value = 0.5;
        const shelf = ctx.createBiquadFilter(); shelf.type = "highshelf"; shelf.frequency.value = 4000; shelf.gain.value = -4;
        const sub = ctx.createBiquadFilter(); sub.type = "highpass"; sub.frequency.value = 38;
        G.bus.connect(sub); sub.connect(shelf); shelf.connect(top); top.connect(comp); comp.connect(G.master); G.master.connect(ctx.destination);
        // a big hall, after a short pre-delay
        G.rev = ctx.createConvolver(); G.rev.buffer = impulse(ctx, 4.2, 2.4);
        const pre = ctx.createDelay(0.2); pre.delayTime.value = 0.035;
        const revTone = ctx.createBiquadFilter(); revTone.type = "lowpass"; revTone.frequency.value = 5000;
        G.revIn = ctx.createGain(); G.revIn.gain.value = 0.9; G.revIn.connect(pre); pre.connect(G.rev); G.rev.connect(revTone); revTone.connect(G.bus);
        // a stereo chorus: two short delays, swaying slowly, one each side
        G.choIn = ctx.createGain(); G.choIn.gain.value = 1;
        [[0.012, -0.7, 0.31], [0.017, 0.7, 0.23]].forEach(([d, pan, rate]) => {
            const dl = ctx.createDelay(0.05); dl.delayTime.value = d;
            const lfo = ctx.createOscillator(); lfo.frequency.value = rate; const depth = ctx.createGain(); depth.gain.value = 0.0025;
            lfo.connect(depth); depth.connect(dl.delayTime); lfo.start();
            const g = ctx.createGain(); g.gain.value = 0.55;
            const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            G.choIn.connect(dl); dl.connect(g);
            if (p) { p.pan.value = pan; g.connect(p); p.connect(G.bus); p.connect(G.revIn); } else { g.connect(G.bus); g.connect(G.revIn); }
        });
        // the 80s snare's gated room
        G.gate = ctx.createConvolver(); G.gate.buffer = impulse(ctx, 0.32, 1, true);
        G.gateIn = ctx.createGain(); G.gateIn.gain.value = 0.55; G.gateIn.connect(G.gate); G.gate.connect(G.bus);
        // a dotted-eighth echo, darkening as it repeats
        G.dly = ctx.createDelay(2); G.fb = ctx.createGain(); G.fb.gain.value = 0.42;
        const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2000;
        G.dlyIn = ctx.createGain(); G.dlyIn.gain.value = 1;
        G.dlyIn.connect(G.dly); G.dly.connect(tone); tone.connect(G.fb); G.fb.connect(G.dly);
        const dOut = ctx.createGain(); dOut.gain.value = 0.42; tone.connect(dOut); dOut.connect(G.bus); dOut.connect(G.revIn);
        G.noise = noiseBuf(ctx, 2);
        // Pulse waves (25% and 12.5%), built from their harmonics: softer than a raw square.
        const pulse = (duty) => { const n = 24, re = new Float32Array(n), im = new Float32Array(n);
            for (let h = 1; h < n; h++) { re[h] = (2 / (h * Math.PI)) * Math.sin(2 * Math.PI * h * duty) * Math.pow(0.93, h); im[h] = (2 / (h * Math.PI)) * (1 - Math.cos(2 * Math.PI * h * duty)) * Math.pow(0.93, h); }
            return ctx.createPeriodicWave(re, im); };
        G.pulse25 = pulse(0.25); G.pulse12 = pulse(0.125);
        { const n = 12, re = new Float32Array(n), im = new Float32Array(n), amps = [0, 1, 0.55, 0.36, 0.24, 0.15, 0.1, 0.07, 0.05, 0.035, 0.025, 0.018];
          for (let h = 1; h < n; h++) im[h] = amps[h]; G.pluck = ctx.createPeriodicWave(re, im); }
        return G;
    }
    // A gain with an envelope: a (attack), peak, then down to 0 by `end`.
    function env(G, t, peak, a, end, sustain, rel) {
        const g = G.ctx.createGain(), p = g.gain;
        p.setValueAtTime(0.0001, t);
        p.linearRampToValueAtTime(peak, t + a);
        if (sustain != null) { p.setValueAtTime(peak, Math.max(t + a, sustain)); p.exponentialRampToValueAtTime(0.0001, sustain + rel); }
        else p.exponentialRampToValueAtTime(0.0001, end);
        return g;
    }
    function osc(G, type, f, t, stop) { const o = G.ctx.createOscillator(); if (typeof type === "string") o.type = type; else o.setPeriodicWave(type); o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop + 0.05); return o; }
    function noise(G, t, stop) { const s = G.ctx.createBufferSource(); s.buffer = G.noise; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(stop + 0.05); return s; }
    function filt(G, type, f, q) { const b = G.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
    const to = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
    const send = (node, G, { rev = 0, dly = 0, gate = 0, cho = 0, dry = 1 } = {}) => {
        if (dry) { if (dry === 1) node.connect(G.bus); else { const s = G.ctx.createGain(); s.gain.value = dry; node.connect(s); s.connect(G.bus); } }
        if (cho) { const s = G.ctx.createGain(); s.gain.value = cho; node.connect(s); s.connect(G.choIn); }
        if (rev) { const s = G.ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(G.revIn); }
        if (dly) { const s = G.ctx.createGain(); s.gain.value = dly; node.connect(s); s.connect(G.dlyIn); }
        if (gate) { const s = G.ctx.createGain(); s.gain.value = gate; node.connect(s); s.connect(G.gateIn); }
    };

    // ---- synth kit
    function kick(G, t, v) {
        const o = osc(G, "sine", 150, t, t + 0.4); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        send(to(o, env(G, t, 0.95 * v, 0.002, 0.38)), G);
        const c = noise(G, t, t + 0.02); send(to(c, filt(G, "highpass", 3000), env(G, t, 0.12 * v, 0.001, 0.015)), G);
    }
    function snare(G, t, v) {
        const n = noise(G, t, t + 0.25), body = osc(G, "triangle", 190, t, t + 0.15);
        body.frequency.exponentialRampToValueAtTime(140, t + 0.1);
        send(to(n, filt(G, "bandpass", 1900, 0.8), env(G, t, 0.5 * v, 0.002, 0.2)), G, { gate: 1, rev: 0.15 });
        send(to(body, env(G, t, 0.35 * v, 0.002, 0.12)), G, { gate: 0.6 });
    }
    function hat(G, t, v, open) {
        const n = noise(G, t, t + (open ? 0.3 : 0.06));
        send(to(n, filt(G, "highpass", 7500), env(G, t, 0.13 * v, 0.001, t + (open ? 0.26 : 0.045))), G);
    }
    function crash(G, t) { const n = noise(G, t, t + 1.6); send(to(n, filt(G, "highpass", 5000), env(G, t, 0.14, 0.003, t + 1.5)), G, { rev: 0.3 }); }
    function tom(G, t, f) { const o = osc(G, "sine", f, t, t + 0.3); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.25); send(to(o, env(G, t, 0.45, 0.002, t + 0.28)), G, { gate: 0.5, rev: 0.2 }); }
    function bassNote(G, t, m, dur, v) {
        const lp = filt(G, "lowpass", 300, 6), e = env(G, t, 0.34 * v, 0.004, null, t + dur * 0.8, 0.05);
        lp.frequency.setValueAtTime(1300, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
        const a = osc(G, "sawtooth", hz(m), t, t + dur + 0.1), b = osc(G, "square", hz(m - 12), t, t + dur + 0.1);
        const mix = G.ctx.createGain(); mix.gain.value = 0.6; a.connect(mix); b.connect(mix);
        send(to(mix, lp, e), G);
    }
    function pad(G, t, notes, dur, bright) {
        notes.forEach((m) => [-9, 0, 8].forEach((cents) => {
            const o = osc(G, "sawtooth", hz(m + 12), t, t + dur + 1.2); o.detune.value = cents;
            const lp = filt(G, "lowpass", bright ? 1900 : 1300, 0.5);
            send(to(o, lp, env(G, t, 0.032, 0.45, null, t + dur, 0.9)), G, { rev: 0.5 });
        }));
    }
    function arp(G, t, m, v, sunny) {
        const o = osc(G, sunny ? "square" : "sawtooth", hz(m), t, t + 0.2), lp = filt(G, "lowpass", 2200, 3);
        lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.14);
        send(to(o, lp, env(G, t, 0.075 * v, 0.003, t + 0.16)), G, { dly: 0.5, rev: 0.15 });
    }
    function lead(G, t, m, dur, kind) {
        const f = hz(m), end = t + dur;
        if (kind === "bell") {
            // A DX-style FM bell: a sine carrier, a sine modulator at 1:1 dying away, plus a glassy 3.5:1 tine.
            const car = osc(G, "sine", f, t, end + 0.6), mod = osc(G, "sine", f, t, end + 0.6), mg = G.ctx.createGain();
            mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.6);
            mod.connect(mg); mg.connect(car.frequency);
            const tine = osc(G, "sine", f * 3.5, t, t + 0.5);
            send(to(car, env(G, t, 0.2, 0.004, null, end, 0.5)), G, { dly: 0.35, rev: 0.35 });
            send(to(tine, env(G, t, 0.05, 0.002, t + 0.35)), G, { rev: 0.3 });
            return;
        }
        const lp = filt(G, "lowpass", 3200, 1.5), e = env(G, t, 0.15, 0.02, null, end, 0.18);
        const lfo = osc(G, "sine", 5.5, t, end + 0.3), lg = G.ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + Math.min(0.35, dur));      // vibrato comes in
        lfo.connect(lg);
        [-7, 7].forEach((c) => { const o = osc(G, "sawtooth", f, t, end + 0.3); o.detune.value = c; lg.connect(o.detune); o.connect(lp); });
        const sq = osc(G, "square", f / 2, t, end + 0.3), sg = G.ctx.createGain(); sg.gain.value = 0.35; sq.connect(sg); sg.connect(lp);
        send(to(lp, e), G, { dly: 0.45, rev: 0.35 });
    }

    // ---- the ambient synthwave kit
    function softKick(G, t, v) {
        const o = osc(G, "sine", 105, t, t + 0.6); o.frequency.exponentialRampToValueAtTime(46, t + 0.18);
        send(to(o, env(G, t, 0.22 * v, 0.006, t + 0.5)), G);
    }
    function softSnare(G, t, v) {
        // Dark and soft, mostly the hall: no gate, nothing above 2.4 kHz.
        const n = noise(G, t, t + 0.4);
        send(to(n, filt(G, "highpass", 350), filt(G, "lowpass", 2400, 0.4), env(G, t, 0.075 * v, 0.006, t + 0.3)), G, { rev: 1.1, dry: 0.6 });
        const b = osc(G, "sine", 190, t, t + 0.2); b.frequency.exponentialRampToValueAtTime(150, t + 0.15);
        send(to(b, env(G, t, 0.05 * v, 0.004, t + 0.16)), G, { rev: 0.5 });
    }
    function softHat(G, t, v) {
        const n = noise(G, t, t + 0.08);
        send(to(n, filt(G, "bandpass", 7000, 0.8), env(G, t, 0.022 * v, 0.002, t + 0.06)), G, { rev: 0.3 });
    }
    function swell(G, t, dur) {
        // A soft rising air into a new section, in place of a cymbal.
        const n = noise(G, t, t + dur), lp = filt(G, "lowpass", 400, 1.2);
        lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
        const g = G.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + dur * 0.95); g.gain.linearRampToValueAtTime(0, t + dur);
        send(to(n, lp, g), G, { rev: 0.8 });
    }
    function warmBass(G, t, m, dur, v) {
        const a = osc(G, "sine", hz(m), t, t + dur + 0.5), b = osc(G, "triangle", hz(m), t, t + dur + 0.5);
        const bg = G.ctx.createGain(); bg.gain.value = 0.35; b.connect(bg);
        const mix = G.ctx.createGain(); a.connect(mix); bg.connect(mix);
        send(to(mix, filt(G, "lowpass", 420, 0.5), env(G, t, 0.085 * v, 0.03, null, t + dur * 0.9, 0.35)), G);
    }
    function lushPad(G, t, notes, dur, bright, level) {
        /* Each note four saws a few cents apart into ONE filter that opens and
           closes over the bar (light enough to play live on a phone; the
           chorus gives it its width). */
        notes.forEach((m) => {
            const lp = filt(G, "lowpass", 700, 0.3);
            lp.frequency.setValueAtTime(650, t); lp.frequency.linearRampToValueAtTime(bright ? 1700 : 1350, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(800, t + dur + 1.5);
            [-11, -4, 4, 11].forEach((cents) => { const o = osc(G, "sawtooth", hz(m + 12), t, t + dur + 2); o.detune.value = cents; o.connect(lp); });
            send(to(lp, env(G, t, 0.038 * (level || 1), 1.1, null, t + dur, 1.6)), G, { rev: 0.7, cho: 0.9 });
        });
    }
    function softArp(G, t, m, v) {
        const a = osc(G, "triangle", hz(m), t, t + 0.6), b = osc(G, "sine", hz(m + 12), t, t + 0.4);
        const bg = G.ctx.createGain(); bg.gain.value = 0.25; b.connect(bg);
        const mix = G.ctx.createGain(); a.connect(mix); bg.connect(mix);
        send(to(mix, filt(G, "lowpass", 2200, 0.5), env(G, t, 0.05 * v, 0.006, t + 0.5)), G, { dly: 0.7, rev: 0.45, cho: 0.4 });
    }
    function softLead(G, t, m, dur, kind) {
        const f = hz(m), end = t + Math.max(dur, 0.2);
        if (kind === "bell") {
            // A gentle FM electric piano: the modulator fades fast, so it starts with a little shine and settles to a pure tone.
            const car = osc(G, "sine", f, t, end + 1.2), mod = osc(G, "sine", f, t, end + 1.2), mg = G.ctx.createGain();
            mg.gain.setValueAtTime(f * 0.9, t); mg.gain.exponentialRampToValueAtTime(f * 0.04, t + 0.45);
            mod.connect(mg); mg.connect(car.frequency);
            send(to(car, env(G, t, 0.12, 0.008, null, end, 1.0)), G, { dly: 0.5, rev: 0.6, cho: 0.5 });
            return;
        }
        const lp = filt(G, "lowpass", 1500, 0.6);
        lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(1700, t + 0.25);
        const lfo = osc(G, "sine", 4.6, t, end + 0.8), lg = G.ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + Math.min(0.5, dur)); lfo.connect(lg);
        const mix = G.ctx.createGain();
        [-6, 6].forEach((c) => { const o = osc(G, "sawtooth", f, t, end + 0.8); o.detune.value = c; lg.connect(o.detune); o.connect(mix); });
        const s = osc(G, "sine", f, t, end + 0.8), sg = G.ctx.createGain(); sg.gain.value = 0.8; s.connect(sg); sg.connect(mix);
        send(to(mix, lp, env(G, t, 0.055, 0.08, null, end, 0.6)), G, { dly: 0.55, rev: 0.65, cho: 0.6 });
    }

    // ---- the pop groove, shared
    function clap(G, t, v) {
        // Three quick soft bursts, dark, mostly room: a clap you feel more than hear.
        for (let i = 0; i < 3; i++) {
            const at = t + i * 0.011, n = noise(G, at, at + 0.25), last = i === 2;
            send(to(n, filt(G, "bandpass", 1300, 0.9), filt(G, "lowpass", 3000, 0.5), env(G, at, (last ? 0.045 : 0.03) * v, 0.002, at + (last ? 0.2 : 0.012))), G, { rev: 0.8, dry: 0.55 });
        }
    }
    const GROOVE = { 0: 3, 3: 1, 6: 2, 8: 3, 11: 1, 14: 2 };
    function popBass(G, t, s, notes, st, v) {
        if (GROOVE[s] == null) return;
        const m = s === 6 || s === 14 ? notes[2] - 12 : notes[0];
        warmBass(G, t, m, st * GROOVE[s], (s === 0 || s === 8 ? 1 : 0.75) * v);
    }
    function stab(G, t, notes, v) {
        [notes[0] + 24, notes[1] + 24, notes[2] + 24].forEach((m) => {
            const a = osc(G, "triangle", hz(m), t, t + 0.4), e = env(G, t, 0.026 * v, 0.004, t + 0.3);
            send(to(a, filt(G, "lowpass", 2600, 0.5), e), G, { rev: 0.45, dly: 0.3, cho: 0.5 });
        });
    }
    // ---- folk
    /* THE GUITAR: each string one oscillator playing a plucked-string tone
       (its harmonics built in, G.pluck) through a filter that closes as the
       note rings, so it starts bright and mellows, as a string does; one
       pick's tick a strum. Light enough to play live. */
    function guitar(G, t, m, v) {
        const o = osc(G, G.pluck, hz(m), t, t + 1.4), lp = filt(G, "lowpass", 3800, 0.6);
        lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.6);
        send(to(o, lp, env(G, t, 0.045 * v, 0.002, t + 1.3)), G, { rev: 0.3, cho: 0.25 });
    }
    function strum(G, t, notes, down, v) {
        const voicing = [notes[0] + 12, notes[2] + 12, notes[0] + 24, notes[1] + 24, notes[2] + 24];
        const strings = down ? voicing.slice(1) : voicing.slice(2).reverse();
        strings.forEach((m, i) => guitar(G, t + i * 0.014, m, v * (down ? 1 : 0.6)));
        const n = noise(G, t, t + 0.03); send(to(n, filt(G, "highpass", 2500), env(G, t, 0.012 * v, 0.001, t + 0.02)), G);
    }
    function cajonKick(G, t, v) {
        const o = osc(G, "sine", 98, t, t + 0.35); o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
        send(to(o, env(G, t, 0.2 * v, 0.004, t + 0.3)), G);
        const n = noise(G, t, t + 0.05); send(to(n, filt(G, "lowpass", 420), env(G, t, 0.05 * v, 0.002, t + 0.04)), G);
    }
    function cajonSlap(G, t, v) {
        const n = noise(G, t, t + 0.15); send(to(n, filt(G, "bandpass", 1700, 0.7), filt(G, "lowpass", 3800), env(G, t, 0.05 * v, 0.003, t + 0.12)), G, { rev: 0.4 });
        const o = osc(G, "sine", 230, t, t + 0.1); send(to(o, env(G, t, 0.04 * v, 0.003, t + 0.08)), G);
    }
    function whistle(G, t, m, dur) {
        const f = hz(m), end = t + dur, o = osc(G, "sine", f, t, end + 0.4);
        const lfo = osc(G, "sine", 5.6, t, end + 0.4), lg = G.ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(11, t + Math.min(0.4, dur)); lfo.connect(lg); lg.connect(o.detune);
        send(to(o, env(G, t, 0.075, 0.03, null, end, 0.25)), G, { rev: 0.55, dly: 0.35, cho: 0.3 });
        const br = noise(G, t, end + 0.2); send(to(br, filt(G, "bandpass", f, 8), env(G, t, 0.012, 0.03, null, end, 0.2)), G, { rev: 0.3 });
    }
    function fiddle(G, t, m, dur) {
        const f = hz(m), end = t + dur, mix = G.ctx.createGain();
        const lfo = osc(G, "sine", 5.8, t, end + 0.5), lg = G.ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.45, dur)); lfo.connect(lg);
        [-5, 5].forEach((c) => { const o = osc(G, "sawtooth", f, t, end + 0.5); o.detune.value = c; lg.connect(o.detune); o.connect(mix); });
        const body = filt(G, "peaking", 1100, 1.2); body.gain.value = 5;
        send(to(mix, filt(G, "lowpass", 2400, 0.6), body, env(G, t, 0.045, 0.09, null, end, 0.3)), G, { rev: 0.6, dly: 0.25, cho: 0.4 });
    }
    // ---- chip
    function pulseLead(G, t, m, dur) {
        const f = hz(m), end = t + dur, o = osc(G, G.pulse25, f, t, end + 0.3);
        const lfo = osc(G, "sine", 6, t, end + 0.3), lg = G.ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + Math.min(0.2, dur * 0.5)); lg.gain.linearRampToValueAtTime(15, t + Math.min(0.5, dur)); lfo.connect(lg); lg.connect(o.detune);
        send(to(o, filt(G, "lowpass", 2600, 0.5), env(G, t, 0.05, 0.005, null, end, 0.12)), G, { dly: 0.45, rev: 0.45, cho: 0.35 });
    }
    function chipArp(G, t, m, v) {
        const o = osc(G, G.pulse12, hz(m), t, t + 0.15);
        send(to(o, filt(G, "lowpass", 2000, 0.5), env(G, t, 0.022 * v, 0.002, t + 0.1)), G, { dly: 0.3, rev: 0.25 });
    }
    function triBass(G, t, m, dur, v) {
        const o = osc(G, "triangle", hz(m), t, t + dur + 0.2);
        send(to(o, filt(G, "lowpass", 900, 0.5), env(G, t, 0.13 * v, 0.004, null, t + dur * 0.85, 0.06)), G);
    }

    // ---- jungle kit
    function conga(G, t, f, v, slap) {
        const o = osc(G, "sine", f * 1.5, t, t + 0.35); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
        send(to(o, env(G, t, 0.3 * v, 0.004, t + (slap ? 0.12 : 0.3))), G, { rev: 0.2 });
        const n = noise(G, t, t + 0.04); send(to(n, filt(G, "bandpass", slap ? 2200 : 1100, 1.2), env(G, t, (slap ? 0.1 : 0.06) * v, 0.002, t + 0.03)), G);
    }
    function logDrum(G, t, m, v) {
        const o = osc(G, "sine", hz(m), t, t + 0.4), o2 = osc(G, "sine", hz(m) * 2.76, t, t + 0.15);
        send(to(o, env(G, t, 0.3 * v, 0.002, t + 0.38)), G, { rev: 0.2 });
        send(to(o2, env(G, t, 0.08 * v, 0.001, t + 0.1)), G, { rev: 0.2 });
    }
    function shaker(G, t, v) { const n = noise(G, t, t + 0.08); send(to(n, filt(G, "bandpass", 5500, 1.5), env(G, t, 0.04 * v, 0.014, t + 0.07)), G, { rev: 0.2 }); }
    function woodBass(G, t, m, dur) {
        const o = osc(G, "sine", hz(m), t, t + dur + 0.2), o2 = osc(G, "triangle", hz(m), t, t + 0.12);
        send(to(o, env(G, t, 0.24, 0.012, null, t + dur * 0.7, 0.15)), G);
        send(to(o2, env(G, t, 0.06, 0.003, t + 0.1)), G);
    }
    function marimba(G, t, m, v) {
        const f = hz(m), a = osc(G, "sine", f, t, t + 0.6), b = osc(G, "sine", f * 3.93, t, t + 0.12), c = osc(G, "sine", f * 9.2, t, t + 0.04);
        send(to(a, env(G, t, 0.22 * v, 0.002, t + 0.55)), G, { rev: 0.25, dly: 0.2 });
        send(to(b, env(G, t, 0.07 * v, 0.001, t + 0.1)), G, { rev: 0.2 });
        send(to(c, env(G, t, 0.03 * v, 0.001, t + 0.03)), G);
    }
    function flute(G, t, m, dur) {
        const f = hz(m), end = t + dur, o = osc(G, "triangle", f, t, end + 0.3), s = osc(G, "sine", f * 2, t, end + 0.3);
        const lfo = osc(G, "sine", 5, t, end + 0.3), lg = G.ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.4, dur)); lfo.connect(lg); lg.connect(o.detune); lg.connect(s.detune);
        const sg = G.ctx.createGain(); sg.gain.value = 0.25; s.connect(sg);
        const mix = G.ctx.createGain(); o.connect(mix); sg.connect(mix);
        send(to(mix, filt(G, "lowpass", 3000), env(G, t, 0.17, 0.07, null, end, 0.2)), G, { rev: 0.45, dly: 0.25 });
        const br = noise(G, t, end + 0.2); send(to(br, filt(G, "bandpass", f * 2, 2), env(G, t, 0.05, 0.05, null, end, 0.15)), G, { rev: 0.3 });
    }
    function bird(G, t) {
        const base = 2400 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            const at = t + i * (0.09 + Math.random() * 0.05), o = osc(G, "sine", base, at, at + 0.09);
            o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), at + 0.06);
            const p = G.ctx.createStereoPanner ? G.ctx.createStereoPanner() : null;
            const e = env(G, at, 0.035, 0.008, at + 0.08);
            if (p) { p.pan.value = Math.random() * 1.6 - 0.8; send(to(o, e, p), G, { rev: 0.5 }); } else send(to(o, e), G, { rev: 0.5 });
        }
    }
    function frog(G, t) {
        const f = 95 + Math.random() * 70;
        for (let k = 0; k < 2; k++) {
            const at = t + k * 0.16, o = osc(G, "square", f, at, at + 0.14), am = osc(G, "square", 28, at, at + 0.14), ag = G.ctx.createGain();
            ag.gain.value = 0.5; am.connect(ag);
            const g = G.ctx.createGain(); g.gain.value = 0.5; ag.connect(g.gain);
            send(to(o, filt(G, "bandpass", 520, 2.5), g, env(G, at, 0.09, 0.01, at + 0.13)), G, { rev: 0.35 });
        }
    }
    function insects(G, t, dur) {
        const n = noise(G, t, t + dur), am = osc(G, "sine", 21, t, t + dur), ag = G.ctx.createGain(); ag.gain.value = 0.012; am.connect(ag);
        const g = G.ctx.createGain(); g.gain.value = 0.018; ag.connect(g.gain);
        send(to(n, filt(G, "bandpass", 5200, 6), g, env(G, t, 1, 0.5, null, t + dur - 0.4, 0.4)), G, { rev: 0.3 });
    }

    /* ---------------------------------------------------------------
       DREAMY LAYERS AND THE NEW VOICES (19 Nov 2026, the owner's: "make
       them truly unique ... dreamy, layered appropriately, high quality").
       Every song now has its own RECIPE (below): its own beat, bassline,
       keys part, leads and pad layers, so no two sound alike. */
    // The air: a fifth and an octave high, soft sines breathing in and out.
    function airPad(G, t, notes, dur, level) {
        const lfo = osc(G, "sine", 0.22 + Math.random() * 0.1, t, t + dur + 3), lg = G.ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg);
        const g = G.ctx.createGain(); g.gain.value = 0.65; lg.connect(g.gain);
        [notes[0] + 36, notes[2] + 36, notes[1] + 48].forEach((m, i) => { const o = osc(G, i === 2 ? "sine" : "triangle", hz(m), t, t + dur + 3); o.detune.value = (i - 1) * 6; o.connect(g); });
        send(to(g, filt(G, "lowpass", 5000, 0.5), env(G, t, 0.022 * (level || 1), 1.6, null, t + dur, 2.4)), G, { rev: 1.2, dry: 0.4, cho: 0.6 });
    }
    // The choir: an "ahh" (saws through two vowel formants), slow to come and go.
    function choirPad(G, t, notes, dur, level) {
        notes.forEach((m, i) => {
            const mix = G.ctx.createGain();
            [-7, 7].forEach((c) => { const o = osc(G, "sawtooth", hz(m + 24), t, t + dur + 3); o.detune.value = c + i * 2; o.connect(mix); });
            const f1 = filt(G, "bandpass", 720, 5), f2 = filt(G, "bandpass", 1180, 6), out = G.ctx.createGain();
            mix.connect(f1); mix.connect(f2); f1.connect(out); f2.connect(out);
            send(to(out, env(G, t, 0.05 * (level || 1), 1.4, null, t + dur, 2)), G, { rev: 1.1, dry: 0.45, cho: 0.8 });
        });
    }
    function pads(G, t, notes, dur, list, bright) {
        (list || ["warm"]).forEach((p) => {
            if (p === "warm") lushPad(G, t, notes, dur, bright, 0.85);
            else if (p === "warm-low") lushPad(G, t, notes, dur, false, 0.55);
            else if (p === "air") airPad(G, t, notes, dur, 1);
            else if (p === "choir") choirPad(G, t, notes, dur, 1);
            else if (p === "accordion") accordion(G, t, notes, dur);
        });
    }
    // Keys: an FM electric piano (a soft tine and a warm body), as city-pop has.
    function ep(G, t, m, dur, v) {
        const f = hz(m), car = osc(G, "sine", f, t, t + dur + 1), mod = osc(G, "sine", f * 14, t, t + 0.3), mg = G.ctx.createGain();
        mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 0.25); mod.connect(mg); mg.connect(car.frequency);
        const body = osc(G, "sine", f, t, t + dur + 1);
        const mix = G.ctx.createGain(); car.connect(mix); body.connect(mix);
        const trem = osc(G, "sine", 4.2, t, t + dur + 1), tg = G.ctx.createGain(); tg.gain.value = 0.18; trem.connect(tg);
        const g = G.ctx.createGain(); g.gain.value = 1; tg.connect(g.gain);
        send(to(mix, g, filt(G, "lowpass", 3200, 0.5), env(G, t, 0.03 * v, 0.004, null, t + dur, 0.6)), G, { rev: 0.5, cho: 0.6, dly: 0.2 });
    }
    function epChord(G, t, notes, dur, v) { [notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[0] + 36].forEach((m, i) => ep(G, t + i * 0.006, m, dur, v)); }
    // A glass bell: pure, long, into the echo.
    function glassBell(G, t, m, v) {
        const f = hz(m), a = osc(G, "sine", f, t, t + 2.2), b = osc(G, "sine", f * 2.01, t, t + 1), c = osc(G, "sine", f * 4.2, t, t + 0.4);
        send(to(a, env(G, t, 0.05 * v, 0.003, t + 2)), G, { rev: 0.8, dly: 0.6, cho: 0.4 });
        send(to(b, env(G, t, 0.018 * v, 0.002, t + 0.9)), G, { rev: 0.6, dly: 0.4 });
        send(to(c, env(G, t, 0.008 * v, 0.001, t + 0.3)), G, { rev: 0.5 });
    }
    // Leads
    function brassLead(G, t, m, dur) {
        // A soft synth-brass: saws whose filter blooms open after the note starts.
        const f = hz(m), end = t + Math.max(dur, 0.2), mix = G.ctx.createGain();
        [-8, 0, 8].forEach((c) => { const o = osc(G, "sawtooth", f, t, end + 0.6); o.detune.value = c; o.connect(mix); });
        const lp = filt(G, "lowpass", 500, 1); lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2100, t + 0.18); lp.frequency.linearRampToValueAtTime(1500, t + 0.6);
        send(to(mix, lp, env(G, t, 0.045, 0.06, null, end, 0.45)), G, { dly: 0.4, rev: 0.6, cho: 0.5 });
    }
    function glassLead(G, t, m, dur) {
        // Dreamy: a sine and its octave, gently tremoloed, drenched in the hall.
        const f = hz(m), end = t + Math.max(dur, 0.25), a = osc(G, "sine", f, t, end + 1.4), b = osc(G, "triangle", f * 2, t, end + 1.4);
        const bg = G.ctx.createGain(); bg.gain.value = 0.25; b.connect(bg);
        const mix = G.ctx.createGain(); a.connect(mix); bg.connect(mix);
        const lfo = osc(G, "sine", 5, t, end + 1.4), lg = G.ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + 0.5); lfo.connect(lg); lg.connect(a.detune);
        send(to(mix, env(G, t, 0.09, 0.05, null, end, 1.1)), G, { dly: 0.6, rev: 1.0, cho: 0.5 });
    }
    function saxLead(G, t, m, dur) {
        // A soft synth-sax: a saw and a pulse through a reedy formant, scooping up into the note.
        const f = hz(m), end = t + Math.max(dur, 0.2), mix = G.ctx.createGain();
        const a = osc(G, "sawtooth", f, t, end + 0.5), b = osc(G, G.pulse25, f, t, end + 0.5);
        [a, b].forEach((o) => { o.detune.setValueAtTime(-60, t); o.detune.linearRampToValueAtTime(0, t + 0.07); o.connect(mix); });
        const lfo = osc(G, "sine", 5.2, t, end + 0.5), lg = G.ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(10, t + 0.4); lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
        const fm = filt(G, "peaking", 1400, 2); fm.gain.value = 8;
        send(to(mix, filt(G, "lowpass", 2600, 0.7), fm, env(G, t, 0.04, 0.04, null, end, 0.25)), G, { dly: 0.35, rev: 0.6, cho: 0.4 });
    }
    function leadOf(kind) {
        return { saw: (G, t, m, d) => softLead(G, t, m, d, "saw"), bell: (G, t, m, d) => softLead(G, t, m, d, "bell"), brass: brassLead, glass: glassLead, sax: saxLead,
            whistle, fiddle, pulse: pulseLead, pulse12: (G, t, m, d) => pulse12Lead(G, t, m, d), flute, recorder: (G, t, m, d) => whistle(G, t, m + 12, d),
            mandolin: (G, t, m, d) => mandolin(G, t, m, d), marimba: (G, t, m) => marimba(G, t, m, 1), kalimba: (G, t, m) => kalimba(G, t, m, 1), steel: (G, t, m) => steelDrum(G, t, m, 1) }[kind] || ((G, t, m, d) => softLead(G, t, m, d, "saw"));
    }
    function pulse12Lead(G, t, m, dur) {
        const f = hz(m), end = t + dur, o = osc(G, G.pulse12, f, t, end + 0.3), e2 = osc(G, "sine", f * 2, t, t + 0.25);
        send(to(o, filt(G, "lowpass", 2400, 0.5), env(G, t, 0.045, 0.004, null, end, 0.3)), G, { dly: 0.55, rev: 0.55, cho: 0.4 });
        send(to(e2, env(G, t, 0.02, 0.002, t + 0.2)), G, { rev: 0.4 });
    }
    function mandolin(G, t, m, dur) {
        // Tremolo picking: the note re-struck every sixteenth for its length.
        const n = Math.max(1, Math.round(dur / 0.11));
        for (let i = 0; i < n; i++) guitar(G, t + i * (dur / n), m, i === 0 ? 1.1 : 0.7);
    }
    function kalimba(G, t, m, v) {
        const f = hz(m), a = osc(G, "sine", f, t, t + 1.2), b = osc(G, "sine", f * 5.4, t, t + 0.08);
        send(to(a, env(G, t, 0.14 * v, 0.002, t + 1.1)), G, { rev: 0.5, dly: 0.35 });
        send(to(b, env(G, t, 0.04 * v, 0.001, t + 0.06)), G, { rev: 0.3 });
    }
    function steelDrum(G, t, m, v) {
        const f = hz(m), a = osc(G, "sine", f, t, t + 0.9), b = osc(G, "sine", f * 2, t, t + 0.6), c = osc(G, "sine", f * 3, t, t + 0.3);
        send(to(a, env(G, t, 0.1 * v, 0.004, t + 0.8)), G, { rev: 0.5, dly: 0.3 });
        send(to(b, env(G, t, 0.06 * v, 0.004, t + 0.5)), G, { rev: 0.4 });
        send(to(c, env(G, t, 0.025 * v, 0.003, t + 0.25)), G, { rev: 0.3 });
    }
    function accordion(G, t, notes, dur) {
        notes.forEach((m) => {
            const mix = G.ctx.createGain();
            [-9, 9].forEach((c) => { const o = osc(G, "sawtooth", hz(m + 12), t, t + dur + 1); o.detune.value = c; o.connect(mix); });
            const trem = osc(G, "sine", 5.5, t, t + dur + 1), tg = G.ctx.createGain(); tg.gain.value = 0.25; trem.connect(tg);
            const g = G.ctx.createGain(); g.gain.value = 1; tg.connect(g.gain);
            send(to(mix, filt(G, "bandpass", 900, 0.8), g, env(G, t, 0.03, 0.25, null, t + dur, 0.5)), G, { rev: 0.5, cho: 0.5 });
        });
    }
    function rim(G, t, v) { const o = osc(G, "triangle", 820, t, t + 0.05); send(to(o, filt(G, "bandpass", 1600, 2), env(G, t, 0.06 * v, 0.001, t + 0.04)), G, { rev: 0.5 }); }
    // Bass shapes
    function seqBass(G, t, s, notes, st) {
        // Sixteenths, root and octave, filtered soft: the night-drive pulse, kept low in the mix.
        const m = notes[0] + (s % 4 === 2 ? 12 : 0), lp = filt(G, "lowpass", 380, 2);
        lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(300, t + st * 0.9);
        const o = osc(G, "sawtooth", hz(m), t, t + st + 0.1);
        send(to(o, lp, env(G, t, 0.055, 0.004, t + st * 0.95)), G);
    }
    const WALK = [0, 4, 7, 9];
    function walkBass(G, t, s, notes, st, nextRoot) {
        if (s % 4 !== 0) return;
        const i = s / 4, m = i === 3 ? (nextRoot != null ? nextRoot - 1 : notes[0] + 11) : notes[0] + [0, 7, 12][i];
        warmBass(G, t, m, st * 3.6, i === 0 ? 1 : 0.8);
    }

    /* THE RECIPES: what makes each song itself. */
    const RECIPES = {
        // NEON 108: the night drive, dark and wide
        midnight: { kit: "drive", bass: "seq", keys: "arp16", lead: "brass", leadB: "brass", pads: ["warm", "air"] },
        neonrain: { kit: "half", bass: "held", keys: "bells", lead: "glass", leadB: "glass", pads: ["warm-low", "air", "choir"], swing: 0 },
        turbo:    { kit: "broken", bass: "groove", keys: "stab", lead: "saw", leadB: "brass", pads: ["warm", "air"] },
        // PINK PALMS: sunny city-pop
        ocean:    { kit: "shuffle", bass: "walk", keys: "ep", lead: "bell", leadB: "sax", pads: ["air"], swing: 0.18 },
        pastel:   { kit: "drive", bass: "groove", keys: "ep", lead: "sax", leadB: "bell", pads: ["warm", "air"], swing: 0.1 },
        cruise:   { kit: "half", bass: "held", keys: "bells", lead: "glass", leadB: "bell", pads: ["air", "choir"] },
        // QUARRY FOLK
        lanterns:   { kit: "cajon", pattern: "strum", lead: "whistle", leadB: "fiddle", pads: ["warm-low", "air"] },
        riverstone: { kit: "light", pattern: "pick", lead: "recorder", leadB: "mandolin", pads: ["air"] },
        oldmill:    { kit: "stomp", pattern: "strum", lead: "fiddle", leadB: "whistle", pads: ["accordion", "air"] },
        // PIXEL FM
        parade:   { kit: "pop", arp: 16, lead: "pulse", leadB: "pulse", pads: ["warm-low", "air"] },
        fountain: { kit: "half", arp: 8, lead: "pulse12", leadB: "pulse", pads: ["air", "choir"] },
        nightbus: { kit: "hats", arp: 8, lead: "glass", leadB: "pulse12", pads: ["warm-low", "air", "choir"] },
        // THE BOG SIGNAL
        mangrove: { mallet: "marimba", leadB: "flute", pads: ["warm-low", "air"] },
        frogs:    { mallet: "kalimba", leadB: "recorder", pads: ["air", "choir"], sparse: true },
        canopy:   { mallet: "steel", leadB: "flute", pads: ["warm-low", "air"] }
    };

    /* ---------------------------------------------------------------
       ONE SIXTEENTH: what plays on step k (from the song's top) at time t. */
    function play16(G, S, k, t) {
        if (k === 0 && G.dly) G.dly.delayTime.setValueAtTime(S.step * 3, t);
        const R = RECIPES[S.id] || {};
        const bars = S.bars, bi = Math.floor(k / 16) % bars.length, bar = bars[bi], s = k % 16, st = S.step;
        const prog = bar.sec === "B" ? S.B : S.A, chord = prog[bar.i % prog.length], notes = chordNotes(chord);
        const nextBar = bars[(bi + 1) % bars.length], nextChord = (nextBar.sec === "B" ? S.B : S.A)[nextBar.i % (nextBar.sec === "B" ? S.B : S.A).length];
        const barStart = s === 0, beat = bar.sec === "A" || bar.sec === "B";
        const sw = (R.swing || 0) * st, tt = s % 4 === 2 ? t + sw : t;          // the swung offbeat
        const mel = (L, offBar, v, fn) => {
            const pos = ((offBar * 16 + s) % L.steps);
            L.notes.forEach((n) => { if (n.at === pos && n.m) fn(n.m, n.len * st, v); });
        };
        const leadA = leadOf(R.lead), leadB = leadOf(R.leadB || R.lead);
        const melody = () => {
            if (bar.sec === "A") mel(S.lA, bar.i, 1, (m, d) => leadA(G, tt, m, d));
            else if (bar.sec === "B") mel(S.lB, bar.i, 1, (m, d) => leadB(G, tt, m, d));
            else if (bar.sec === "break" && bar.i >= bar.n / 2) mel(S.lA, bar.i - bar.n / 2, 1, (m, d) => leadA(G, tt, m - 12, d));
        };
        if (barStart) pads(G, t, notes, st * 16, R.pads, S.sunny);
        if (barStart && bar.i === bar.n - 1 && !beat) swell(G, t, st * 16);

        if (S.style === "synth") {
            // the beat
            if (beat) {
                const B = bar.sec === "B";
                if (R.kit === "drive") { if (s % 4 === 0) softKick(G, t, s === 0 ? 0.9 : 0.65); if (s === 4 || s === 12) clap(G, t, 0.9); if (s % 2 === 0) softHat(G, tt, s % 4 === 2 ? 0.9 : 0.35); }
                else if (R.kit === "half") { if (s === 0 || (s === 10 && bar.i % 2)) softKick(G, t, s ? 0.5 : 0.8); if (s === 8) softSnare(G, t, 0.9); if (s % 4 === 2) softHat(G, tt, B ? 0.8 : 0.5); }
                else if (R.kit === "shuffle") { if (s === 0 || s === 8) softKick(G, t, 0.8); if (s === 4 || s === 12) rim(G, t, 1); if (s % 2 === 0) softHat(G, tt, s % 4 === 2 ? 0.8 : 0.45); }
                else if (R.kit === "broken") { if (s === 0 || s === 6 || s === 10) softKick(G, t, s ? 0.6 : 0.9); if (s === 4 || s === 12) clap(G, t, 1); softHat(G, t, s % 4 === 2 ? 0.8 : s % 2 ? 0.2 : 0.4); }
            }
            // the bass
            if (beat) {
                if (R.bass === "seq") seqBass(G, t, s, notes, st);
                else if (R.bass === "walk") walkBass(G, t, s, notes, st, chordNotes(nextChord)[0]);
                else if (R.bass === "groove") popBass(G, t, s, notes, st, 1);
                else { if (s === 0) warmBass(G, t, notes[0], st * 8, 1); if (s === 8) warmBass(G, t, notes[0], st * 8, 0.8); }
            } else if (bar.sec !== "intro" || bar.i >= 4) { if (s === 0) warmBass(G, t, notes[0], st * 15, 0.85); }
            // the keys
            const kv = bar.sec === "intro" ? 0.6 : bar.sec === "break" ? 0.75 : 1;
            if (bar.sec !== "intro" || bar.i >= 2) {
                if (R.keys === "arp16") { const up = [notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[0] + 36]; softArp(G, t, up[s % 4], kv * 0.6); }
                else if (R.keys === "bells") { if (s % 4 === 0) glassBell(G, t, [notes[0] + 36, notes[2] + 36, notes[1] + 36, notes[2] + 24][s / 4], kv); }
                else if (R.keys === "stab") { if (s === 6 || s === 14) stab(G, t, notes, kv); if (s % 2 === 0 && !beat) softArp(G, t, [notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[0] + 36][(s / 2) % 4], kv * 0.6); }
                else if (R.keys === "ep") { if (s === 2 || s === 10 || (s === 7 && bar.i % 2)) epChord(G, tt, notes, st * (s === 7 ? 2 : 5), kv); }
                else { if (s % 2 === 0) softArp(G, t, [notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[0] + 36, notes[2] + 24, notes[1] + 24, notes[0] + 24, notes[2] + 12][s / 2], kv * 0.7); }
            }
            melody();
        } else if (S.style === "folk") {
            if (R.pattern === "pick") {
                // fingerpicking: bass note, then the strings up and down, in eighths
                const PICK = [notes[0] + 12, notes[2] + 12, notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[1] + 24, notes[0] + 24, notes[2] + 12];
                if (s % 2 === 0 && (bar.sec !== "intro" || bar.i >= 1)) guitar(G, t, PICK[s / 2], s === 0 ? 1.1 : 0.75);
            } else {
                const STRUM = { 0: 1, 4: 1, 6: 0, 10: 0, 12: 1, 14: 0 };
                if (STRUM[s] != null && (bar.sec !== "intro" || bar.i >= 1)) strum(G, t, notes, STRUM[s] === 1, bar.sec === "break" ? 0.6 : 1);
            }
            if (beat) {
                if (R.kit === "cajon") { if (s === 0 || s === 8 || (s === 10 && bar.i % 2)) cajonKick(G, t, s === 10 ? 0.6 : 1); if (s === 4 || s === 12) cajonSlap(G, t, 1); if (s % 2 === 0) shaker(G, t, s % 4 === 2 ? 0.9 : 0.5); }
                else if (R.kit === "stomp") { if (s === 0 || s === 8) cajonKick(G, t, 1.1); if (s === 4 || s === 12) clap(G, t, 1.1); if (s % 4 === 2) shaker(G, t, 0.7); }
                else { if (s % 2 === 0) shaker(G, t, s % 4 === 2 ? 0.7 : 0.35); if (s === 8) cajonSlap(G, t, 0.5); }
                if (R.kit === "light") { if (s === 0) warmBass(G, t, notes[0], st * 8, 0.9); if (s === 8) warmBass(G, t, notes[2] - 12, st * 8, 0.75); }
                else popBass(G, t, s, notes, st, 0.9);
            } else if (bar.sec === "break" && s === 0) warmBass(G, t, notes[0], st * 14, 0.8);
            melody();
        } else if (S.style === "chip") {
            if (bar.sec !== "intro" || bar.i >= 1) {
                const up = [notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[0] + 36];
                if (R.arp === 8) { if (s % 2 === 0) chipArp(G, t, up[(s / 2) % 4], bar.sec === "break" ? 0.7 : 1); }
                else chipArp(G, t, up[s % 4], bar.sec === "break" ? 0.7 : 1);
            }
            if (beat) {
                if (R.kit === "pop") { if (s === 0 || s === 8 || s === 11) softKick(G, t, s === 11 ? 0.55 : 0.9); if (s === 4 || s === 12) { clap(G, t, 0.9); softSnare(G, t, 0.5); } if (s % 2 === 0) softHat(G, t, s % 4 === 2 ? 0.9 : 0.45); }
                else if (R.kit === "half") { if (s === 0) softKick(G, t, 0.85); if (s === 8) { softSnare(G, t, 0.8); clap(G, t, 0.6); } if (s % 4 === 2) softHat(G, t, 0.7); }
                else { if (s % 2 === 0) softHat(G, t, s % 4 === 2 ? 0.7 : 0.3); if (s === 0 && bar.sec === "B") softKick(G, t, 0.6); }
                if (R.kit === "pop") { if (GROOVE[s] != null) triBass(G, t, s === 6 || s === 14 ? notes[2] - 12 : notes[0], st * GROOVE[s], s === 0 || s === 8 ? 1 : 0.75); }
                else { if (s === 0) triBass(G, t, notes[0], st * 7, 0.9); if (s === 8) triBass(G, t, notes[2] - 12, st * 7, 0.75); }
            } else if (bar.sec === "break" && s === 0) triBass(G, t, notes[0], st * 14, 0.8);
            melody();
        } else {
            // THE JUNGLE: the swamp under everything, drums in layers, a mallet over a round bass
            const mallet = leadOf(R.mallet || "marimba");
            if (beat && !R.sparse && (s === 4 || s === 12)) clap(G, t, 0.6);
            if (barStart && bar.i % 2 === 0) insects(G, t, st * 32);
            if (barStart && Math.random() < 0.6) bird(G, t + Math.random() * st * 12);
            if (R.sparse ? s % 8 === 6 && Math.random() < 0.55 : barStart && Math.random() < 0.25) frog(G, t + Math.random() * st * 2);
            const groove = bar.sec !== "intro";
            shaker(G, t, s % 4 === 0 ? 1 : s % 2 === 0 ? 0.6 : 0.35);
            if (groove) {
                if (R.sparse) {
                    if (s === 0 || s === 6 || s === 10) logDrum(G, t, notes[0] + (s === 6 ? 19 : 12), s ? 0.7 : 1);
                    if (s === 12) conga(G, t, 210, 0.8, true);
                } else {
                    if ([0, 6, 7, 10, 14, 15].includes(s)) conga(G, t, s === 7 || s === 15 ? 230 : 175, 1, false);
                    if (s === 4 || s === 12) conga(G, t, 210, 1, true);
                    if (bar.sec !== "break" && [2, 9, 11].includes(s)) conga(G, t, 330, 0.6, false);
                    if (bar.sec !== "break" && (s === 0 || s === 10)) logDrum(G, t, notes[0] + 12, 1);
                }
                if (bar.sec !== "break" && [0, 3, 8, 11].includes(s)) woodBass(G, t, notes[0] + (s === 11 ? 7 : 0), st * (s === 0 || s === 8 ? 3 : 2));
            } else if (s % 8 === 0) logDrum(G, t, notes[0] + 12, 0.6);
            if (bar.sec === "A") mel(S.lA, bar.i, 1, (m, d) => mallet(G, t, m, d));
            if (bar.sec === "B") { mel(S.lA, bar.i, 0.45, (m, d) => mallet(G, t, m, d)); mel(S.lB, bar.i, 1, (m, d) => leadOf(R.leadB || "flute")(G, t, m, d)); }
            if (bar.sec === "break" && s % 4 === 0) mallet(G, t, notes[(s / 4) % 3] + 24, st);
        }
    }

    /* ---------------------------------------------------------------
       THE LIVE PLAYER */
    let ctx = null, G = null, cur = null, k = 0, nextAt = 0, timer = 0, playing = false, held = false, fadeTimer = 0, endAt = Infinity, onEnd = null;
    // The jungle is sparser, so it is turned up to sit level with the synthwave.
    // Each song trimmed to sit level with the rest (measured from the renders, 19 Nov 2026).
    const TRIM = { midnight: 1.17, neonrain: 0.9, turbo: 1, ocean: 0.87, pastel: 0.79, cruise: 0.89, mangrove: 0.96, frogs: 1.08, canopy: 0.98, lanterns: 1.06, riverstone: 1.16, oldmill: 1.12, parade: 1.17, fountain: 1.33, nightbus: 1.06 };
    const LEVEL = 0.62, levelOf = (S) => (({ jungle: 0.68, folk: 0.9, chip: 0.9 })[S.style] || 0.9) * (TRIM[S.id] || 1);
    function setup() {
        if (G) return true;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* not Safari */ }
        ctx = new AC(); G = graph(ctx);
        return true;
    }
    function tick() {
        if (!playing || !cur) return;
        while (nextAt < ctx.currentTime + 0.15) {
            /* THE SONG LOOPS (the owner's, 19 Nov 2026): its form goes round seamlessly, intro and all;
               after the times asked for, the radio is told, at the end of the form, never mid-phrase. */
            if (k >= endAt && onEnd) { const f = onEnd; onEnd = null; setTimeout(f, Math.max(0, (nextAt - ctx.currentTime) * 1000)); }
            play16(G, cur, k, nextAt); k++; nextAt += cur.step;
        }
    }
    function clockOn() { if (!timer && playing && !held && !document.hidden) timer = setInterval(tick, 25); }
    function clockOff() { clearInterval(timer); timer = 0; }
    // play(id, { loops, onEnd }): loops times through the form (default: for ever), then onEnd().
    function play(id, opts) {
        if (!setup()) return;
        clearTimeout(fadeTimer);
        if (ctx.state !== "running") { try { ctx.resume(); } catch (e) { /* the first press will */ } }
        const begin = () => {
            cur = song(id); k = 0; playing = true;
            endAt = opts && opts.loops ? cur.bars.length * 16 * opts.loops : Infinity; onEnd = (opts && opts.onEnd) || null;
            const t = ctx.currentTime;
            G.master.gain.cancelScheduledValues(t); G.master.gain.setValueAtTime(0.0001, t); G.master.gain.linearRampToValueAtTime(levelOf(cur), t + 0.5);
            nextAt = t + 0.08;
            clockOff(); clockOn();
        };
        if (playing) { stop(0.4); fadeTimer = setTimeout(begin, 450); } else begin();
    }
    function stop(fade) {
        if (!G) return;
        playing = false; clockOff();
        const t = ctx.currentTime, f = fade == null ? 0.3 : fade;
        G.master.gain.cancelScheduledValues(t); G.master.gain.setValueAtTime(G.master.gain.value, t); G.master.gain.linearRampToValueAtTime(0.0001, t + f);
    }
    function pause() { held = true; clockOff(); if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch (e) { /* fine */ } } }
    function resume() { held = false; if (ctx && ctx.state !== "running" && playing) { try { ctx.resume(); } catch (e) { /* fine */ } } if (playing) { if (ctx) nextAt = Math.max(nextAt, ctx.currentTime + 0.05); clockOn(); } }
    document.addEventListener("visibilitychange", () => { if (document.hidden) clockOff(); else if (playing && !held) { if (ctx) nextAt = Math.max(nextAt, ctx.currentTime + 0.05); clockOn(); } });

    window.GtaTunes = {
        SONGS: SONGS.map((s) => ({ id: s.id, name: s.name, style: s.style })),
        play, stop, pause, resume,
        get playing() { return playing; },
        get current() { return cur ? cur.id : null; }
    };

    // ---- on the dev server: render a song offline (previews, and its levels)
    if (location.hostname === "localhost") {
        window.GtaTunes._render = async function (id, seconds) {
            const sr = 44100, off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr), g = graph(off), S = song(id);
            g.master.gain.setValueAtTime(levelOf(S), 0);
            for (let i = 0, t = 0.05; t < seconds; i++, t += S.step) play16(g, S, i, t);
            const buf = await off.startRendering();
            let peak = 0, sum = 0; const L = buf.getChannelData(0), R = buf.getChannelData(1);
            for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; sum += L[i] * L[i]; }
            return { buf, peak, rms: Math.sqrt(sum / L.length) };
        };
        window.GtaTunes._wav = function (buf) {
            const ch = 2, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2)), w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
            w(0, "RIFF"); out.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
            out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * ch * 2, true);
            const L = buf.getChannelData(0), R = buf.getChannelData(1);
            for (let i = 0, o = 44; i < n; i++) { for (const d of [L, R]) { out.setInt16(o, Math.max(-1, Math.min(1, d[i])) * 32767, true); o += 2; } }
            return new Uint8Array(out.buffer);
        };
    }
})();

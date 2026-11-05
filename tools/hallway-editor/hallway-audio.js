/* The Hallway's soundtrack: lofi, played live with Web Audio, so it costs no download and never quite repeats.
   Eight tracks of a few minutes each over a record's quiet crackle, so there is never a silence.

   The lofi is in the sum: everything going through one worn tape (a single wobble, saturation, the top rolled off), one record's crackle and one small room.
   That's what makes them one album. Everything above the tape is each track's own: its feel, its drums or none, its bass, what plays the chords, what plays the tune, its tempo and even its time signature,
   and each has a second section to go to, so the same one isn't only ever four chords round again.

   Changing track is a handover, not an overlap of two songs:
     - the next track is transposed so it shares the old one's key signature, or moves one step round the circle of fifths
     - the old track finishes on a bar line: its drums, bass and tune stop and it rests on its home chord, going muffled as it goes
     - the new one starts on a bar line with only its chords, then bass and hats, then the full beat
     - only ever one bass, one tune and one beat at a time, and if the key moves the two don't overlap at all
     - the wobble is on the whole mix, so two tracks can't drift out of tune with each other

       HallwayAudio.start()         begin (needs a click first, as all browser audio does)
       HallwayAudio.stop()          fade out
       HallwayAudio.play(i)         hand over to track i
       HallwayAudio.next()          hand over to another track
       HallwayAudio.setVolume(0..1)
       HallwayAudio.onChange = fn   called when the track changes
       HallwayAudio.renderPreview(seconds, [i, j, ...]) -> an AudioBuffer with handovers spaced evenly, for checking */
(function () {
    "use strict";
    const LOOKAHEAD = 2.2, HANDOVER_LEAD = 30, ROOT_MIN = 44, ROOT_MAX = 55;
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    const MAJOR = [0, 2, 4, 7, 9], MINOR = [0, 3, 5, 7, 10], MAJOR7 = [0, 2, 4, 5, 7, 9, 11], MINOR7 = [0, 2, 3, 5, 7, 8, 10];
    const barLenOf = tr => 60 / tr.bpm * (tr.beats || 4);

    /* chords are semitones above the root, all in the track's key; b is the second section, and form says how they come round.
       comp: what plays the chords. bass and drums: how those go. lead and tune: what plays the tune and how it moves. top: how muffled it is. room: how much of the room. */
    const TRACKS = [
        /* the original: a dusty head-nod beat, electric piano stabs, a felt piano tune */
        { name: "The Long Carpet", root: 50, mode: "maj", bpm: 72, swing: .1, every: 1, mins: 4.2, lead: "felt", tune: "walk", density: .5, pad: 900, padVel: .026,
          comp: "stab", compAt: [0, 1.5, 3.5], bass: "boom", drums: "boom", kick: [0, 2.5], snare: [1, 3], hat: .5, form: "AABA",
          chords: [[0, 7, 11, 14, 16], [-3, 4, 7, 11, 12], [-5, 2, 5, 9, 12], [-7, 0, 4, 7, 9]], b: [[-7, 0, 4, 7, 9], [-5, 2, 5, 9, 12], [-3, 4, 7, 12], [-8, -1, 4, 7]] },
        /* bossa: straight eighths, nylon guitar, cross-stick and shaker, a muted horn over it */
        { name: "Room Service", root: 45, mode: "min", bpm: 94, swing: 0, every: 1, mins: 3.6, lead: "horn", tune: "motif", density: .5, pad: 800, padVel: .012, top: 6000,
          comp: "guitar", bass: "bossa", drums: "bossa", form: "AAB",
          chords: [[0, 7, 10, 14, 15], [5, 12, 15, 19], [-2, 5, 8, 12, 14], [3, 10, 14, 19]], b: [[-4, 3, 7, 12], [2, 8, 12, 15], [-5, 2, 5, 10], [0, 7, 10, 15]] },
        /* a jazz waltz, in three: ride cymbal, walking bass, vibes */
        { name: "Lift Music for No One", root: 53, mode: "maj", bpm: 138, beats: 3, swing: .14, every: 2, mins: 3.4, lead: "vibes", tune: "run", density: .55, pad: 1100, padVel: .012,
          comp: "waltz", bass: "walk", drums: "waltz", form: "AABB", scale: 7, room: 1.15,
          chords: [[0, 7, 11, 14, 16], [2, 9, 12, 16, 17], [-5, 2, 5, 9, 12], [5, 12, 16, 21]], b: [[-3, 4, 7, 11, 12], [-8, -1, 2, 7], [-7, 0, 4, 9], [-5, 2, 5, 9]] },
        /* hardly there: brushes, long upright notes, dark slow chords, a bell with an echo */
        { name: "Night Porter", root: 48, mode: "min", bpm: 58, swing: .1, every: 2, mins: 4.6, lead: "bell", tune: "sparse", density: .35, pad: 600, padVel: .03, top: 2500, room: 1.5,
          comp: "none", bass: "long", drums: "brush", form: "AB", echo: { beats: 1.5, back: .42, send: .5 },
          chords: [[0, 7, 10, 14, 15], [-4, 3, 7, 12], [0, 7, 10, 14], [-2, 5, 8, 12, 14]], b: [[5, 12, 15, 19], [-2, 5, 8, 14], [-4, 3, 7, 12], [-5, 2, 5, 10]] },
        /* all arpeggios: a felt piano rippling, a music box over it, a light rolling shuffle */
        { name: "Wallpaper", root: 55, mode: "maj", bpm: 84, swing: .06, every: 1, mins: 3.8, lead: "box", tune: "motif", density: .4, pad: 1200, padVel: .012, top: 7000,
          comp: "arp", bass: "soft", drums: "soft", form: "AAB",
          chords: [[0, 7, 14, 16], [-3, 4, 7, 11, 12], [-7, 0, 4, 7, 9], [-5, 2, 5, 9, 12]], b: [[-7, 0, 4, 9], [0, 7, 11, 16], [-5, 2, 5, 9], [-3, 4, 7, 12]] },
        /* dub: a heavy bass riff, organ on the off-beats, the drop on three, a melodica, and everything sent into a long echo */
        { name: "Floor Three", root: 52, mode: "min", bpm: 70, swing: .08, every: 1, mins: 4.4, lead: "reed", tune: "sparse", density: .4, pad: 750, padVel: 0, top: 3600, room: .7,
          comp: "skank", bass: "dub", drums: "dub", form: "AAAB", echo: { beats: .75, back: .52, send: .6 }, riff: [[0, 0, 1.2], [1.5, 0, .4], [2, 7, .9], [3, 10, .4], [3.5, 7, .4]],
          chords: [[0, 7, 10, 15], [0, 7, 10, 15], [-2, 5, 10, 14], [-2, 5, 10, 14]], b: [[-4, 3, 7, 12], [-2, 5, 10, 14], [0, 7, 10, 15], [0, 7, 10, 15]] },
        /* a piano trio, swinging properly: ride, walking bass, jazz chords and running lines */
        { name: "Sconces", root: 51, mode: "maj", bpm: 112, swing: .16, every: 1, mins: 3.9, lead: "piano", tune: "run", density: .6, pad: 1000, padVel: 0, top: 6000,
          comp: "charleston", bass: "walk", drums: "jazz", form: "AABA", scale: 7,
          chords: [[0, 7, 11, 14], [-3, 4, 7, 10], [2, 9, 12, 17], [-5, 2, 5, 10]], b: [[-8, -1, 2, 7], [-3, 4, 7, 13], [2, 9, 12, 17], [-5, 2, 5, 10]] },
        /* the last one: a piano on its own in an empty building, playing through an old radio */
        { name: "Everyone Has Gone Home", root: 46, mode: "min", bpm: 54, swing: 0, every: 2, mins: 4.8, lead: "felt", leadVel: .13, tune: "sparse", density: .5, pad: 850, padVel: .034, top: 3000, room: 1.7,
          comp: "roll", bass: "none", drums: "none", form: "AB",
          chords: [[0, 7, 10, 14, 15], [3, 10, 14, 19], [-4, 3, 7, 12], [-2, 5, 8, 12, 14]], b: [[5, 12, 15, 19], [3, 10, 14, 19], [-4, 3, 7, 12], [-5, 2, 5, 10]] }
    ];
    /* a little seeded random, so a track's bar is the same whenever it's asked for */
    function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
    /* a key signature, as the pitch class of its major key */
    const sigOf = (root, mode) => ((mode === "min" ? root + 3 : root) % 12 + 12) % 12;
    function rootFor(tr, sig) {
        const pc = tr.mode === "min" ? (sig + 9) % 12 : sig;
        let r = tr.root + (((pc - tr.root) % 12) + 12) % 12;
        while (r > ROOT_MAX) r -= 12; while (r < ROOT_MIN) r += 12;
        return r;
    }

    function build(ctx) {
        /* everything musical goes in here, then through one tape */
        const input = ctx.createGain(); input.gain.value = 1;
        const tape = ctx.createDelay(.05); tape.delayTime.value = .014;
        for (const [hz, depth] of [[.27, .0011], [.071, .0026], [5.3, .000035]]) { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = hz; d.gain.value = depth; l.connect(d); d.connect(tape.delayTime); l.start(); }
        const drive = ctx.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.7) / Math.tanh(1.7); } drive.curve = curve; drive.oversample = "2x";
        const low = ctx.createBiquadFilter(); low.type = "highpass"; low.frequency.value = 38;
        const warm = ctx.createBiquadFilter(); warm.type = "lowshelf"; warm.frequency.value = 220; warm.gain.value = 2.5;
        const top = ctx.createBiquadFilter(); top.type = "lowpass"; top.frequency.value = 4300; top.Q.value = .5;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -19; comp.ratio.value = 3; comp.attack.value = .012; comp.release.value = .22;
        const master = ctx.createGain(); master.gain.value = 0;
        input.connect(tape); tape.connect(drive); drive.connect(low); low.connect(warm); warm.connect(top); top.connect(comp); comp.connect(master); master.connect(ctx.destination);
        /* a small dark room rather than a long hall: lofi is close */
        const verb = ctx.createConvolver();
        const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate), r = rng(4242);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; lp += (r() * 2 - 1 - lp) * (.3 - .22 * t); d[i] = lp * Math.pow(1 - t, 2.6); } }
        verb.buffer = ir;
        const wet = ctx.createGain(); wet.gain.value = .42; verb.connect(wet); wet.connect(input);
        /* the record: a whisper of hiss, soft crackle, the odd pop, on the same loop for ever */
        const sec = 17, nb = ctx.createBuffer(2, ctx.sampleRate * sec, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = nb.getChannelData(c); let lp = 0;
            for (let i = 0; i < d.length; i++) { lp += (r() * 2 - 1 - lp) * .22; d[i] = lp * .1; }
            for (let k = 0; k < sec * 7; k++) { const at = Math.floor(r() * (d.length - 200)), loud = Math.pow(r(), 5) * .85 + .05, sign = r() < .5 ? -1 : 1, width = 6 + Math.floor(r() * 24); for (let j = 0; j < width; j++) d[at + j] += sign * loud * Math.pow(1 - j / width, 3) * (j % 2 ? -1 : 1); }
        }
        const rec = ctx.createBufferSource(); rec.buffer = nb; rec.loop = true;
        const recF = ctx.createBiquadFilter(); recF.type = "bandpass"; recF.frequency.value = 1800; recF.Q.value = .35;
        const recG = ctx.createGain(); recG.gain.value = .075;
        rec.connect(recF); recF.connect(recG); recG.connect(top); rec.start();
        /* one noise for all the drums */
        const hit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), hd = hit.getChannelData(0); for (let i = 0; i < hd.length; i++) hd[i] = r() * 2 - 1;
        return { ctx, input, master, verb, hit, active: [], idx: -1 };
    }

    /* ---------- voices: each sends to the track's bus, and some of it to the room ---------- */
    function send(e, bus, node, wetAmt) { node.connect(bus.dry); if (wetAmt) { const g = e.ctx.createGain(); g.gain.value = wetAmt; node.connect(g); g.connect(bus.wet); } if (bus.echo) { const g = e.ctx.createGain(); g.gain.value = bus.echoSend; node.connect(g); g.connect(bus.echo); } }
    function osc(ctx, type, f, cents, t, stop) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents || 0;
        o.start(t); o.stop(stop); return o;
    }
    function pad(e, bus, t, dur, notes, cutoff, vel) {
        const c = e.ctx, f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = .3;
        f.frequency.setValueAtTime(cutoff * .7, t); f.frequency.linearRampToValueAtTime(cutoff, t + dur * .5); f.frequency.linearRampToValueAtTime(cutoff * .7, t + dur * 1.2);
        const g = c.createGain(), end = t + dur * 1.2;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(.5, dur * .25)); g.gain.setValueAtTime(vel, t + dur * .9); g.gain.linearRampToValueAtTime(0, end);
        for (const n of notes) {
            const fr = midi(n);
            osc(c, "triangle", fr, -3, t, end).connect(f);
            const s = osc(c, "sine", fr, 3, t, end), h = c.createGain(); h.gain.value = .8; s.connect(h); h.connect(f);
        }
        f.connect(g); send(e, bus, g, .5);
    }
    function bass(e, bus, t, n, vel, dur) {
        const c = e.ctx, g = c.createGain(), end = t + dur + .12, f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .025); g.gain.exponentialRampToValueAtTime(vel * .55, t + dur); g.gain.linearRampToValueAtTime(0, end);
        osc(c, "sine", midi(n), 0, t, end).connect(f);
        const up = osc(c, "triangle", midi(n), 0, t, end), ug = c.createGain(); ug.gain.value = .3; up.connect(ug); ug.connect(f);
        f.connect(g); g.connect(bus.drum);
    }
    /* a soft, worn electric piano. Only a little FM: he doesn't like it bright. */
    function ep(e, bus, t, n, vel, dur, pan) {
        const c = e.ctx, fr = midi(n), end = t + dur + .35;
        const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter(), p = c.createStereoPanner();
        car.frequency.value = fr; mod.frequency.value = fr; mg.gain.setValueAtTime(fr * .32, t); mg.gain.exponentialRampToValueAtTime(fr * .02, t + .7);
        mod.connect(mg); mg.connect(car.frequency); f.type = "lowpass"; f.frequency.setValueAtTime(1900, t); f.frequency.exponentialRampToValueAtTime(800, t + 1);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .007); g.gain.exponentialRampToValueAtTime(vel * .32, t + dur); g.gain.linearRampToValueAtTime(0, end);
        p.pan.value = pan; car.connect(f); f.connect(g); g.connect(p); send(e, bus, p, .35);
        mod.start(t); car.start(t); mod.stop(end); car.stop(end);
    }
    function stab(e, bus, t, notes, vel, dur) { notes.forEach((n, i) => ep(e, bus, t + i * .007, n, vel, dur, (i / Math.max(1, notes.length - 1) - .5) * .5)); }
    function pluck(e, bus, t, n, vel, kind) {
        const c = e.ctx, fr = midi(n), end = t + (kind === "bell" ? 3.4 : 2.6) + .2;
        const g = c.createGain(), f = c.createBiquadFilter(); f.type = "lowpass";
        f.frequency.setValueAtTime(kind === "keys" ? 1500 : kind === "vibes" ? 2200 : kind === "bell" ? 2600 : 1300, t);
        f.frequency.exponentialRampToValueAtTime(kind === "bell" ? 1400 : 520, t + 1.6);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + (kind === "felt" ? .018 : .01));
        g.gain.exponentialRampToValueAtTime(Math.max(vel * .01, .0004), end);
        osc(c, "sine", fr, 0, t, end).connect(f);
        if (kind === "felt") { const o2 = osc(c, "sine", fr * 2, 2, t, t + 1.4), h = c.createGain(); h.gain.setValueAtTime(.22, t); h.gain.exponentialRampToValueAtTime(.002, t + 1.3); o2.connect(h); h.connect(f); }
        if (kind === "keys") {
            const m = c.createOscillator(), mg = c.createGain(), o = c.createOscillator(), og = c.createGain();
            m.frequency.value = fr; o.frequency.value = fr; mg.gain.setValueAtTime(fr * .5, t); mg.gain.exponentialRampToValueAtTime(fr * .02, t + 1);
            m.connect(mg); mg.connect(o.frequency); og.gain.value = .55; o.connect(og); og.connect(f); m.start(t); o.start(t); m.stop(end); o.stop(end);
        }
        if (kind === "vibes") {
            const lfo = c.createOscillator(), d = c.createGain(), trem = c.createGain(); lfo.frequency.value = 3.6; d.gain.value = .26; trem.gain.value = .74;
            lfo.connect(d); d.connect(trem.gain); lfo.start(t); lfo.stop(end);
            f.connect(trem); trem.connect(g); send(e, bus, g, .5); return;
        }
        if (kind === "bell") { const o2 = osc(c, "sine", fr * 2.76, 0, t, t + 1.6), h = c.createGain(); h.gain.setValueAtTime(.07, t); h.gain.exponentialRampToValueAtTime(.001, t + 1.5); o2.connect(h); h.connect(f); }
        f.connect(g); send(e, bus, g, kind === "bell" ? .8 : .5);
    }
    /* a held tune: a muted horn, or a melodica */
    function held(e, bus, t, n, vel, dur, kind) {
        const c = e.ctx, fr = midi(n), end = t + dur + .18, g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), ld = c.createGain();
        f.type = "lowpass"; f.Q.value = kind === "horn" ? 1.2 : .6;
        f.frequency.setValueAtTime(kind === "horn" ? 500 : 1000, t); f.frequency.linearRampToValueAtTime(kind === "horn" ? 1150 : 1250, t + .09); f.frequency.linearRampToValueAtTime(kind === "horn" ? 750 : 1000, t + dur);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + (kind === "horn" ? .05 : .03)); g.gain.setValueAtTime(vel * .8, t + Math.max(.06, dur - .05)); g.gain.linearRampToValueAtTime(0, end);
        lfo.frequency.value = kind === "horn" ? 4.7 : 5.6; ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(kind === "horn" ? 7 : 3, t + Math.min(dur, .5)); lfo.connect(ld); lfo.start(t); lfo.stop(end);
        const a = c.createOscillator(); a.type = kind === "horn" ? "sawtooth" : "square"; a.frequency.setValueAtTime(fr * (kind === "horn" ? .985 : 1), t); a.frequency.linearRampToValueAtTime(fr, t + .05); ld.connect(a.detune); a.connect(f); a.start(t); a.stop(end);
        f.connect(g); send(e, bus, g, .45);
    }
    /* a nylon-string guitar, plucked */
    function guitar(e, bus, t, n, vel, pan) {
        const c = e.ctx, fr = midi(n), end = t + 1.1, g = c.createGain(), f = c.createBiquadFilter(), P = c.createStereoPanner();
        f.type = "lowpass"; f.frequency.setValueAtTime(2300, t); f.frequency.exponentialRampToValueAtTime(560, t + .45);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .004); g.gain.exponentialRampToValueAtTime(Math.max(vel * .008, .0003), end);
        osc(c, "triangle", fr, 0, t, end).connect(f); const sw = osc(c, "sawtooth", fr, 2, t, t + .5), h = c.createGain(); h.gain.setValueAtTime(.2, t); h.gain.exponentialRampToValueAtTime(.002, t + .4); sw.connect(h); h.connect(f);
        P.pan.value = pan || 0; f.connect(g); g.connect(P); send(e, bus, P, .3);
    }
    /* an old organ, for the off-beats */
    function organ(e, bus, t, notes, vel, dur) {
        const c = e.ctx, end = t + dur + .06, g = c.createGain(), f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1500;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .008); g.gain.setValueAtTime(vel, t + dur * .6); g.gain.linearRampToValueAtTime(0, end);
        for (const n of notes) { osc(c, "sine", midi(n), 0, t, end).connect(f); const o = osc(c, "sine", midi(n) * 2, 3, t, end), h = c.createGain(); h.gain.value = .5; o.connect(h); h.connect(f); const o3 = osc(c, "sine", midi(n) * 3, 0, t, end), h3 = c.createGain(); h3.gain.value = .22; o3.connect(h3); h3.connect(f); }
        f.connect(g); send(e, bus, g, .25);
    }
    /* an upright bass: a soft thump and a round note that dies away */
    function upright(e, bus, t, n, vel, dur) {
        const c = e.ctx, g = c.createGain(), end = t + dur + .1, f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(620, t); f.frequency.exponentialRampToValueAtTime(240, t + .3);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .012); g.gain.exponentialRampToValueAtTime(vel * .3, t + Math.max(.1, dur)); g.gain.linearRampToValueAtTime(0, end);
        osc(c, "triangle", midi(n), 0, t, end).connect(f); const s2 = osc(c, "sine", midi(n), 0, t, end), h = c.createGain(); h.gain.value = .7; s2.connect(h); h.connect(f);
        f.connect(g); g.connect(bus.drum);
    }
    /* dub's bass: nearly all sub */
    function sub(e, bus, t, n, vel, dur) {
        const c = e.ctx, g = c.createGain(), end = t + dur + .06; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .018); g.gain.setValueAtTime(vel * .85, t + dur * .8); g.gain.linearRampToValueAtTime(0, end);
        osc(c, "sine", midi(n), 0, t, end).connect(g); g.connect(bus.drum);
    }
    /* ---------- drums, soft and dusty, straight onto the bus's beat path ---------- */
    function noiseHit(e, bus, t, dur, vel, type, freq, q, wetAmt) {
        const c = e.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = e.hit; f.type = type; f.frequency.value = freq; f.Q.value = q;
        g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(Math.max(vel * .004, .0002), t + dur);
        s.connect(f); f.connect(g); g.connect(bus.drum); s.start(t, (t * 7.3) % .8); s.stop(t + dur + .02);
        if (wetAmt) { const w = c.createGain(); w.gain.value = wetAmt; g.connect(w); w.connect(bus.wet); }
    }
    function kick(e, bus, t, vel) {
        const c = e.ctx, o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(118, t); o.frequency.exponentialRampToValueAtTime(47, t + .085);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .004); g.gain.exponentialRampToValueAtTime(.0006, t + .3);
        o.connect(g); g.connect(bus.drum); o.start(t); o.stop(t + .32);
        /* everything else leans back from the kick */
        const d = bus.duck.gain; d.setValueAtTime(1, t); d.linearRampToValueAtTime(.74, t + .02); d.linearRampToValueAtTime(1, t + .26);
    }
    function snare(e, bus, t, vel) {
        noiseHit(e, bus, t, .17, vel * .6, "bandpass", 1650, .6, .25);
        const c = e.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(205, t); o.frequency.exponentialRampToValueAtTime(150, t + .06);
        g.gain.setValueAtTime(vel * .38, t); g.gain.exponentialRampToValueAtTime(.0005, t + .1); o.connect(g); g.connect(bus.drum); o.start(t); o.stop(t + .12);
    }
    /* a cross-stick */
    function rim(e, bus, t, vel, wetAmt) {
        noiseHit(e, bus, t, .045, vel * .6, "bandpass", 2100, 2.2, wetAmt || 0);
        const c = e.ctx, o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = 1050; g.gain.setValueAtTime(vel * .5, t); g.gain.exponentialRampToValueAtTime(.0004, t + .03); o.connect(g); g.connect(bus.drum); o.start(t); o.stop(t + .05);
        if (bus.echo) { const q = c.createGain(); q.gain.value = bus.echoSend; g.connect(q); q.connect(bus.echo); }
    }
    const ride = (e, bus, t, vel) => { noiseHit(e, bus, t, .34, vel, "bandpass", 3700, 1.5, .12); noiseHit(e, bus, t, .03, vel * .9, "highpass", 3000, .5, 0); };
    const shaker = (e, bus, t, vel) => noiseHit(e, bus, t, .05, vel, "bandpass", 3300, 1, 0);
    /* a brush going round the snare: the noise swells and falls */
    function brush(e, bus, t, dur, vel) {
        const c = e.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = e.hit; s.loop = true; f.type = "bandpass"; f.frequency.value = 2500; f.Q.value = .5;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur);
        s.connect(f); f.connect(g); g.connect(bus.drum); s.start(t, (t * 3.1) % .8); s.stop(t + dur + .02);
    }
    const hat = (e, bus, t, vel, open) => noiseHit(e, bus, t, open ? .16 : .035, vel, "highpass", 6200, .5, 0);

    /* ---------- a track: bar by bar, the same whenever it's asked for ---------- */
    /* Its tune, one bar at a time. Each kind moves differently: walk wanders through a few notes; motif keeps one rhythm for a whole section, so you can hum it;
       run is a jazz player's line of eighths, then a rest; sparse is a few long notes with room round them. The same phrase comes round, and comes back changed. */
    function tuneFor(tr, seedTrack, phrase, barInCycle, ch) {
        const beats = tr.beats || 4, R = rng((seedTrack + 1) * 3571 + phrase * 977 + barInCycle * 131), big = tr.scale === 7, scale = big ? (tr.mode === "min" ? MINOR7 : MAJOR7) : (tr.mode === "min" ? MINOR : MAJOR), N = scale.length, out = [];
        let step = Math.floor(R() * N) + (big ? 3 : 2);
        const noteAt = s => scale[((s % N) + N) % N] + 12 * Math.floor(s / N);
        const settle = n => { let best = n, bd = 99; for (const s of ch) for (const o of [-12, 0, 12]) { const v = s + o, d = Math.abs(v - n); if (d < bd && v >= 0) { bd = d; best = v; } } return best; };
        const place = (beat, dur, strong) => { step += [-2, -1, -1, 1, 1, 2][Math.floor(R() * 6)]; step = Math.max(0, Math.min(N * 2 - 1, step)); const n = noteAt(step); out.push([beat, (strong ? settle(n) : n) + 12, dur]); };
        if (tr.tune === "motif") {
            /* the rhythm comes from the section alone, so every bar of it has the same shape */
            const S = rng((seedTrack + 1) * 811 + phrase * 53), cells = [[0, 1.5, 2.5], [.5, 1, 2], [0, .5, 2, 3], [1, 1.5, 2.5, 3.5], [0, 2, 2.5]], cell = cells[Math.floor(S() * cells.length)];
            if (barInCycle % 4 === 3) { place(0, 2.5, true); return out; }
            for (const b of cell) if (b < beats) place(b, .7, b % 2 === 0);
            return out;
        }
        if (tr.tune === "run") {
            if (barInCycle % 2 === 1 && R() < .55) { place(0, 1, true); return out; }
            const from = Math.floor(R() * Math.max(1, beats - 1));
            for (let b = from; b < beats; b += .5) if (R() < tr.density + .3) { place(b, .45, b % 1 === 0 && b === from); }
            return out;
        }
        if (tr.tune === "sparse") {
            if (R() > tr.density + .25) return out;
            place(R() < .6 ? 0 : 1, 2.4, true);
            if (R() < .45) place(2.5, 1.2, false);
            return out;
        }
        for (let beat = 0; beat < beats; beat += R() < .35 ? 1 : .5) {
            if (R() > tr.density * (beat === 0 ? 1.15 : .75)) continue;
            place(beat, .8, beat % 2 === 0);
        }
        return out;
    }
    /* what plays the chords */
    const COMP = {
        none() {},
        stab(x) { for (const b of (x.coming && x.bar === 0 ? [0] : x.tr.compAt)) if (x.R() < .9) stab(x.e, x.bus, x.nudge(b), x.notes, .027 + x.R() * .008, b === 0 ? 1.5 : .8); },
        guitar(x) {
            /* the bossa's two-bar pattern, the top of the chord struck together */
            const at = x.bar % 2 ? [.5, 2, 3.5] : [0, 1.5, 3], top = x.notes.slice(-3);
            for (const b of (x.coming && x.bar === 0 ? [0] : at)) top.forEach((n, i) => guitar(x.e, x.bus, x.nudge(b) + i * .009, n, .05, (i - 1) * .3));
        },
        waltz(x) { for (const b of (x.coming && x.bar === 0 ? [0] : x.bar % x.tr.every === 0 ? [1, 2] : [1.5])) if (x.R() < .88) stab(x.e, x.bus, x.nudge(b), x.notes.slice(-3), .026, .5); },
        arp(x) {
            const up = [...x.notes, x.notes[1] + 12, x.notes[2] + 12].sort((a, c) => a - c), seq = x.cycle % 2 ? [...up].reverse() : up;
            for (let k = 0; k < 8; k++) { const n = seq[k % seq.length]; pluck(x.e, x.bus, x.nudge(k / 2), n, (k % 4 === 0 ? .05 : .036) + x.R() * .006, "felt"); }
        },
        skank(x) { for (const b of [.5, 1.5, 2.5, 3.5]) if (x.R() < .94) organ(x.e, x.bus, x.nudge(b), x.notes.slice(-3).map(n => n + 12), .017, .24); },
        charleston(x) {
            const R = x.R, at = x.coming ? [0] : [[0, 1.5], [1.5, 3], [.5, 2.5], [0, 2.5], [1.5, 2.5]][Math.floor(R() * 5)];
            for (const b of at) stab(x.e, x.bus, x.nudge(b), x.notes.slice(1), .027 + R() * .006, .5);
        },
        roll(x) {
            /* a chord let ring, its notes one after another from the bottom; a single note answers it in the second bar */
            if (x.bar % x.tr.every === 0) x.notes.forEach((n, i) => pluck(x.e, x.bus, x.t + i * .07, n, .12, "felt"));
            else if (x.R() < .7) pluck(x.e, x.bus, x.nudge(2), x.notes[x.notes.length - 1], .09, "felt");
        }
    };
    /* what the bass does */
    const BASS = {
        none() {},
        boom(x) {
            const { e, bus, R, nudge, root, ch, next, spb } = x, low = root - 12 + ch[0];
            bass(e, bus, nudge(0), low, .135, spb * 1.5);
            if (R() < .7) bass(e, bus, nudge(2.5), low + (R() < .5 ? 7 : 12), .1, spb * .9);
            if (next !== ch && R() < .5) bass(e, bus, nudge(3.5), root - 12 + next[0] + (R() < .5 ? -2 : 2), .085, spb * .4);
        },
        soft(x) { const low = x.root - 12 + x.ch[0]; bass(x.e, x.bus, x.nudge(0), low, .125, x.spb * 2.4); if (x.R() < .6) bass(x.e, x.bus, x.nudge(2.5), low + 7, .08, x.spb * 1.2); },
        bossa(x) { const low = x.root - 12 + x.ch[0], sp = x.spb; for (const [b, off, l] of [[0, 0, 1.3], [1.5, 7, .4], [2, 7, 1.3], [3.5, 0, .4]]) upright(x.e, x.bus, x.nudge(b), low + off, .125, sp * l); },
        walk(x) {
            /* a note on every beat, through the chord, stepping into the next chord's root from a semitone away */
            const { e, bus, R, nudge, root, ch, next, spb } = x, beats = x.beats, low = root - 12 + ch[0], target = root - 12 + next[0];
            let n = low;
            for (let b = 0; b < beats; b++) {
                if (b === beats - 1 && next !== ch) n = target + (R() < .5 ? -1 : 1);
                else if (b > 0) { const opts = [low + 3 + (x.tr.mode === "maj" ? 1 : 0), low + 7, low + 12, low + 10, low + 5]; n = opts[Math.floor(R() * opts.length)]; while (n > 50) n -= 12; }
                upright(e, bus, nudge(b), n, .13 + (b === 0 ? .02 : 0), spb * .85);
            }
        },
        long(x) { if (x.bar % x.tr.every === 0) upright(x.e, x.bus, x.t, x.root - 12 + x.ch[0], .115, x.spb * 6); else if (x.R() < .5) upright(x.e, x.bus, x.nudge(2), x.root - 12 + x.ch[0] + 7, .09, x.spb * 1.6); },
        dub(x) { const low = x.root - 12 + x.ch[0]; for (const [b, off, l] of x.tr.riff) sub(x.e, x.bus, x.nudge(b), low + off, .17, x.spb * l); }
    };
    /* the drums, or the lack of them */
    const DRUMS = {
        none() {},
        boom(x) {
            const { e, bus, R, nudge, tr, inCycle, cycleLen } = x;
            for (const b of tr.kick) kick(e, bus, nudge(b) + (R() - .5) * .006, .27 + R() * .04);
            for (const b of tr.snare) snare(e, bus, nudge(b) + .012 + R() * .006, .11 + R() * .02);
            if (R() < .35) snare(e, bus, nudge(3.75) + .008, .03);
            for (let b = 0; b < 4; b += .5) { if (R() < .08) continue; hat(e, bus, nudge(b) + (R() - .5) * .006, (b % 1 ? .018 : .03) * tr.hat * 2 * (.8 + R() * .4), b === 3.5 && inCycle === cycleLen - 1); }
            if (R() < .25) hat(e, bus, nudge(1.75), .012 * tr.hat * 2);
        },
        bossa(x) {
            const { e, bus, R, nudge, bar } = x;
            for (const b of [0, 1.5, 2, 3.5]) kick(e, bus, nudge(b), (b % 2 === 0 ? .17 : .1) + R() * .02);
            for (const b of (bar % 2 ? [1, 2.5] : [0, 1.5, 3])) rim(e, bus, nudge(b), .075 + R() * .015, .1);
            for (let b = 0; b < 4; b += .5) shaker(e, bus, nudge(b), b % 1 ? .022 : .012);
        },
        waltz(x) {
            const { e, bus, R, nudge } = x;
            for (const [b, v] of [[0, .05], [1, .04], [1.5, .022], [2, .04]]) ride(e, bus, nudge(b), v + R() * .006);
            kick(e, bus, nudge(0), .1); hat(e, bus, nudge(1), .018);
            if (R() < .4) snare(e, bus, nudge(2.5), .025);
        },
        jazz(x) {
            const { e, bus, R, nudge } = x;
            for (const [b, v] of [[0, .05], [1, .05], [1.5, .024], [2, .05], [3, .05], [3.5, .024]]) ride(e, bus, nudge(b), v + R() * .006);
            for (const b of [1, 3]) hat(e, bus, nudge(b), .024);
            for (let b = 0; b < 4; b++) kick(e, bus, nudge(b), .055);
            for (let k = 0; k < 2; k++) if (R() < .4) snare(e, bus, nudge(Math.floor(R() * 8) / 2), .022 + R() * .02);
        },
        dub(x) {
            const { e, bus, R, nudge, inCycle, cycleLen } = x;
            /* the one drop: nothing on the one, everything on three */
            kick(e, bus, nudge(2), .3); rim(e, bus, nudge(2), .13, .2);
            for (let b = 0; b < 4; b += .5) if (R() > .1) hat(e, bus, nudge(b), b % 1 ? .022 : .012);
            if (inCycle === cycleLen - 1) { rim(e, bus, nudge(3.5), .1); }
        },
        brush(x) {
            const { e, bus, R, nudge, spb, bar } = x;
            for (let b = 0; b < 4; b += 2) brush(e, bus, nudge(b), spb * 1.9, .016);
            for (const b of [1, 3]) noiseHit(e, bus, nudge(b), .09, .024 + R() * .006, "bandpass", 2300, .6, .2);
            if (bar % 2 === 0) kick(e, bus, nudge(0), .13);
        },
        soft(x) {
            const { e, bus, R, nudge } = x;
            kick(e, bus, nudge(0), .17); if (R() < .6) kick(e, bus, nudge(2.5), .11);
            for (const b of [1, 3]) rim(e, bus, nudge(b), .05 + R() * .012);
            for (let b = 0; b < 4; b += .5) shaker(e, bus, nudge(b), b % 1 ? .009 : .016);
        }
    };
    const LEAD_VEL = { bell: .042, box: .03, horn: .03, reed: .018, vibes: .06, piano: .062, felt: .064, keys: .068 };
    function scheduleBar(e, bus, bar) {
        if (bus.lastBar !== null && bar >= bus.lastBar) return;
        const tr = TRACKS[bus.i], beats = tr.beats || 4, spb = 60 / tr.bpm, barLen = spb * beats, t = bus.t0 + bar * barLen, root = bus.root;
        const R = rng((bus.i + 1) * 7919 + bar * 104729), nudge = b => t + (b + (b % 1 >= .49 && b % 1 <= .51 ? tr.swing : b % 1 > .7 ? tr.swing * .5 : 0)) * spb;

        /* going: rest on the home chord, with a last brush of beat if there's time */
        if (bus.outroAt !== null && bar >= bus.outroAt) {
            const n = bar - bus.outroAt, ch0 = tr.chords[0].map(s => root + s);
            if (n === 0) {
                pad(e, bus, t, barLen * (bus.lastBar - bus.outroAt), ch0, tr.pad, .03);
                stab(e, bus, t, ch0, .03, 2.2); bass(e, bus, t, root - 12 + tr.chords[0][0], .13, barLen * .6);
            } else stab(e, bus, t + spb, ch0.slice(1), .018, 2.2);
            return;
        }
        const every = tr.every, n = tr.chords.length, cycleLen = every * n, cycle = Math.floor(bar / cycleLen), inCycle = bar - cycle * cycleLen, form = tr.form || "A";
        const setAt = c => form[c % form.length] === "B" && tr.b ? tr.b : tr.chords, letter = form[cycle % form.length], round = Math.floor(cycle / form.length);
        const ch = setAt(cycle)[Math.floor(inCycle / every)], nextBar = bar + 1, next = setAt(Math.floor(nextBar / cycleLen))[Math.floor((nextBar % cycleLen) / every)], notes = ch.map(s => root + s);
        /* it breathes: every so often the beat drops out for a turn of the chords, and the tune rests for one */
        const coming = bar < bus.intro, noBeat = !coming && cycle % 8 === 7, noTune = coming || cycle % 6 === 5;
        const x = { e, bus, tr, R, t, nudge, spb, beats, root, ch, next, notes, bar, cycle, inCycle, cycleLen, coming };

        if (tr.padVel && bar % every === 0) pad(e, bus, t, barLen * every, notes, tr.pad, tr.padVel);
        COMP[tr.comp](x);
        if (!coming || bar >= 1) BASS[tr.bass](x);
        if (!coming && !noBeat) DRUMS[tr.drums](x);
        if (!noTune) {
            /* a section's tune comes round the same for two rounds, then changes */
            const phrase = letter === "B" ? 2 + round % 2 : Math.floor(round / 2) % 3 * 3, vel = tr.leadVel || LEAD_VEL[tr.lead];
            for (const [b, s, dur] of tuneFor(tr, bus.i, phrase, inCycle, ch)) {
                const at = nudge(b) + (R() - .5) * .012, v = vel + R() * vel * .25;
                if (tr.lead === "horn" || tr.lead === "reed") held(e, bus, at, root + s, v, dur * spb, tr.lead);
                else if (tr.lead === "box") pluck(e, bus, at, root + s + 12, v, "bell");
                else if (tr.lead === "piano") pluck(e, bus, at, root + s, v, "felt");
                else pluck(e, bus, at, root + s, v, tr.lead);
            }
        }
    }
    function startBus(e, i, t, fade, root, intro) {
        const c = e.ctx, tr = TRACKS[i], g = c.createGain(), wet = c.createGain(), dry = c.createGain(), duck = c.createGain(), drum = c.createGain(), f = c.createBiquadFilter(), wetG = c.createGain();
        /* it comes up out of the muffle as well as getting louder */
        f.type = "lowpass"; f.Q.value = .3;
        f.frequency.setValueAtTime(fade > 1 ? 600 : (tr.top || 16000), t); f.frequency.exponentialRampToValueAtTime(tr.top || 16000, t + Math.max(fade * 1.6, .1));
        g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(1, t, fade / 3);
        wetG.gain.setValueAtTime(0, t); wetG.gain.setTargetAtTime(tr.room || 1, t, fade / 3);
        dry.connect(duck); duck.connect(f); drum.connect(f); f.connect(g); g.connect(e.input);
        wet.connect(wetG); wetG.connect(e.verb);
        const bus = { i, t0: t, nextBar: 0, g, f, wetG, dry, wet, duck, drum, root: root === undefined ? tr.root : root, intro: intro || 0, outroAt: null, lastBar: null, end: t + tr.mins * 60, stopAt: null, fade };
        /* a track with its own long echo, dark, each repeat fainter */
        if (tr.echo) { const d = c.createDelay(3), back = c.createGain(), lp = c.createBiquadFilter(); d.delayTime.value = 60 / tr.bpm * tr.echo.beats; back.gain.value = tr.echo.back; lp.type = "lowpass"; lp.frequency.value = 1500; d.connect(lp); lp.connect(back); back.connect(d); lp.connect(dry); bus.echo = d; bus.echoSend = tr.echo.send; }
        e.active.push(bus); e.idx = i;
        return bus;
    }
    function fadeBus(e, bus, t, fade) {
        const tr = TRACKS[bus.i];
        for (const [p, v] of [[bus.g.gain, 1], [bus.wetG.gain, tr.room || 1]]) { p.setValueAtTime(v, t); p.setTargetAtTime(0, t, fade / 3); p.setValueAtTime(0, t + fade * 1.4); }
        bus.f.frequency.setValueAtTime(tr.top || 16000, t); bus.f.frequency.exponentialRampToValueAtTime(500, t + fade);
        bus.stopAt = t + fade * 1.4;
    }
    /* The handover. now is the audio clock, passed in so a preview can use it too. */
    function handover(e, i, manual, now) {
        const cur = e.active.find(b => b.stopAt === null);
        if (!cur) return startBus(e, i, now + .05, 1);
        const curTr = TRACKS[cur.i];
        /* one that was still waiting to begin just gives up its place */
        if (cur.t0 > now + .02) {
            cur.g.gain.cancelScheduledValues(now); cur.g.gain.setValueAtTime(0, now); cur.wetG.gain.cancelScheduledValues(now); cur.wetG.gain.setValueAtTime(0, now);
            cur.stopAt = now;
            return startBus(e, i, cur.t0, cur.fade, rootFor(TRACKS[i], sigOf(cur.root, curTr.mode)), 3);
        }
        const barLen = barLenOf(curTr), cycle = curTr.every * curTr.chords.length;
        let bar = Math.max(cur.nextBar, Math.ceil((now - cur.t0) / barLen));
        if (!manual) bar = Math.ceil(bar / cycle) * cycle;
        const outro = manual ? 1 : 2, tA = cur.t0 + bar * barLen, tEnd = tA + outro * barLen;
        cur.outroAt = bar; cur.lastBar = bar + outro;
        /* usually a step round the circle of fifths, so the album doesn't sit in one key, and then they don't overlap; now and then the same key signature */
        const sig = sigOf(cur.root, curTr.mode), move = Math.random() < .7, wantSig = move ? (sig + (Math.random() < .5 ? 7 : 5)) % 12 : sig, root = rootFor(TRACKS[i], wantSig);
        const fade = barLen * outro + (move ? 0 : barLen * .5);
        fadeBus(e, cur, tA + (manual ? 0 : barLen * .5), fade);
        const next = barLenOf(TRACKS[i]), begin = move ? tEnd + barLen * .25 : tEnd - barLen * .5;
        return startBus(e, i, begin, next * 1.1, root, 3);
    }
    function pump(e, until, now) {
        for (const bus of e.active) {
            const barLen = barLenOf(TRACKS[bus.i]);
            while (bus.t0 + bus.nextBar * barLen < until && (bus.stopAt === null || bus.t0 + bus.nextBar * barLen < bus.stopAt)) scheduleBar(e, bus, bus.nextBar++);
        }
        e.active = e.active.filter(b => { if (b.stopAt !== null && now > b.stopAt + 8) { try { b.g.disconnect(); b.wetG.disconnect(); } catch (x) { /* already gone */ } return false; } return true; });
    }

    /* ---------- the live player ---------- */
    let eng = null, timer = 0, order = [], orderAt = 0, playing = false;
    const api = {
        tracks: TRACKS.map(t => ({ name: t.name, minutes: t.mins })),
        onChange: null,
        get playing() { return playing; },
        get current() { return eng ? eng.idx : -1; },
        volume: .8,
        get position() { if (!eng || !playing) return null; const b = eng.active.find(x => x.i === eng.idx && x.stopAt === null); return b ? { at: Math.max(0, eng.ctx.currentTime - b.t0), of: b.end - b.t0 } : null; },
        setVolume(v) { api.volume = v; if (eng && playing) { const t = eng.ctx.currentTime; eng.master.gain.cancelScheduledValues(t); eng.master.gain.setTargetAtTime(v * .62, t, .1); } },
        start(i) {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            if (!eng) eng = build(new AC());
            if (eng.ctx.state === "suspended") eng.ctx.resume();
            const t = eng.ctx.currentTime;
            for (const b of eng.active) if (b.stopAt !== null && b.stopAt > t) { for (const g of [b.g.gain, b.wetG.gain]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + .25); } b.stopAt = t + .25; }
            eng.master.gain.cancelScheduledValues(t); eng.master.gain.setTargetAtTime(api.volume * .62, t, .8);
            playing = true;
            if (!eng.active.some(b => b.stopAt === null)) startBus(eng, i === undefined ? nextIndex() : i, t + .05, 3, undefined, 2);
            if (!timer) timer = setInterval(tick, 500);
            tick(); changed();
        },
        stop() {
            playing = false; clearInterval(timer); timer = 0;
            if (!eng) return changed();
            const t = eng.ctx.currentTime;
            eng.master.gain.cancelScheduledValues(t); eng.master.gain.setTargetAtTime(0, t, .7);
            for (const b of eng.active) if (b.stopAt === null) fadeBus(eng, b, t + 3, .1);
            const e0 = eng; setTimeout(() => { if (!playing) { e0.active.length = 0; e0.ctx.suspend(); } }, 3400);
            changed();
        },
        play(i) { if (!playing) return api.start(i); handover(eng, i, true, eng.ctx.currentTime); pump(eng, eng.ctx.currentTime + LOOKAHEAD, eng.ctx.currentTime); changed(); },
        next() { if (!playing) return api.start(); api.play(nextIndex()); },
        /* for checking: render a stretch offline, with the tracks handing over at even spacing. marks: when each one began. */
        renderPreview(seconds, list, sampleRate) {
            const c = new OfflineAudioContext(2, Math.floor((sampleRate || 44100) * seconds), sampleRate || 44100), e = build(c), marks = [];
            e.master.gain.value = .5;
            startBus(e, list[0], .05, 3, undefined, 2);
            for (let k = 1; k < list.length; k++) { const T = seconds * k / list.length; pump(e, T, 0); const b = handover(e, list[k], false, T); marks.push({ track: list[k], at: b.t0 }); }
            pump(e, seconds, 0);
            api.lastMarks = marks;
            return c.startRendering();
        },
        _forTests: { TRACKS, sigOf, rootFor, tuneFor }
    };
    /* the next in the round, but never the one already playing: picking one by hand can put it next */
    function nextIndex() { let n = roundNext(); if (eng && n === eng.idx && TRACKS.length > 1) n = roundNext(); return n; }
    function roundNext() {
        /* a shuffled round, so every track comes up before any comes back */
        if (orderAt >= order.length) { const a = TRACKS.map((_, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } if (eng && a[0] === eng.idx && a.length > 1) a.push(a.shift()); order = a; orderAt = 0; }
        return order[orderAt++];
    }
    function changed() { if (api.onChange) api.onChange(); }
    function tick() {
        if (!eng || !playing) return;
        const now = eng.ctx.currentTime, cur = eng.active.find(b => b.stopAt === null);
        if (cur && cur.t0 <= now && now >= cur.end - HANDOVER_LEAD) handover(eng, nextIndex(), false, now);
        pump(eng, now + LOOKAHEAD, now);
        changed();
    }
    window.HallwayAudio = api;
})();

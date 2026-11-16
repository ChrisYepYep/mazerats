/* Quiz Night's sound: the cues behind the soundboard.
 *
 * NOTHING HERE PLAYS ON ITS OWN (16 Nov 2026, the host's call). The quiz
 * makes no sound by itself; every cue is a button on the soundboard at the
 * foot of the screen, pressed by the host when the moment wants it. Two of
 * them are loops, and a loop runs until its button is pressed again.
 *
 * The style is the big television quiz: a dark studio, low strings, a pulse
 * under the question, a hit when the answer is locked, a heartbeat while the
 * room waits, and brass when it lands. All of it is original and all of it is
 * SYNTHESISED when played. There are no audio files, for the same reason the
 * quiz has no server: /quiz has to keep working from a home-screen icon with
 * no signal.
 *
 * With the Christmas quiz switched on the same cues wear sleigh bells and
 * chimes, and the winner's fanfare walks down "Joy to the World", which is
 * old enough to belong to everybody.
 *
 * The instruments are built on any BaseAudioContext, so the code that plays
 * out of the phone can also be rendered offline and measured — which is how
 * these were checked for level and clipping without a pair of ears.
 *
 *   QuizAudio.cues                       [{ id, label, loop }] in board order
 *   QuizAudio.press(id)                  play a sting, or toggle a loop
 *   QuizAudio.looping()                  id of the loop running, or ''
 *   QuizAudio.stop()                     silence any loop
 *   QuizAudio.setFestive(bool)
 *   QuizAudio.render(id, seconds, festive) -> Promise<AudioBuffer>
 */
(function () {
    'use strict';

    var AC = window.AudioContext || window.webkitAudioContext;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;

    /* Note name -> frequency. 'A4' = 440. */
    var SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    function hz(name) {
        var m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
        var n = SEMIS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        var midi = (parseInt(m[3], 10) + 1) * 12 + n;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    /* ------------------------------------------------------------ the rig */

    /* One rig per context: a dry bus and a reverb send into a limiter. The
       reverb is a generated impulse, three seconds of darkening noise: a big
       empty studio, which is most of what makes these theatrical rather than
       a row of beeps. */
    function makeRig(ctx) {
        var out = ctx.createDynamicsCompressor();
        out.threshold.value = -10;
        out.knee.value = 6;
        out.ratio.value = 8;
        out.attack.value = 0.003;
        out.release.value = 0.2;

        var master = ctx.createGain();
        master.gain.value = 0.85;
        out.connect(master);
        master.connect(ctx.destination);

        var dry = ctx.createGain();
        dry.connect(out);

        var len = Math.floor(ctx.sampleRate * 3.2);
        var ir = ctx.createBuffer(2, len, ctx.sampleRate);
        /* A fixed seed, so the room is the same room every time and an
           offline render is repeatable. */
        var seed = 1234567;
        function rnd() {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296 * 2 - 1;
        }
        for (var ch = 0; ch < 2; ch++) {
            var d = ir.getChannelData(ch);
            var lp = 0;
            for (var i = 0; i < len; i++) {
                var t = i / len;
                lp += (rnd() - lp) * (0.5 - 0.4 * t);      /* darker as it decays */
                d[i] = lp * Math.pow(1 - t, 2.2);
            }
        }
        var verb = ctx.createConvolver();
        verb.buffer = ir;
        var wet = ctx.createGain();
        wet.gain.value = 0.55;
        verb.connect(wet);
        wet.connect(out);

        /* Shared noise, for cymbals, swells, sleigh bells and drum skins. */
        var nlen = ctx.sampleRate * 2;
        var noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
        var nd = noise.getChannelData(0);
        for (var k = 0; k < nlen; k++) { nd[k] = rnd(); }

        return { ctx: ctx, dry: dry, verb: verb, noise: noise };
    }

    /* A voice's output: to the dry bus, and `send` of it to the room. */
    function bus(rig, level, send) {
        var g = rig.ctx.createGain();
        g.gain.value = level;
        g.connect(rig.dry);
        if (send) {
            var s = rig.ctx.createGain();
            s.gain.value = send;
            g.connect(s);
            s.connect(rig.verb);
        }
        return g;
    }

    function partial(rig, dest, type, freq, t, peak, attack, decay) {
        var o = rig.ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + attack + decay + 0.05);
        return o;
    }

    function noiseSrc(rig, t, dur) {
        var src = rig.ctx.createBufferSource();
        src.buffer = rig.noise;
        src.loop = true;
        src.start(t, (t * 7.3) % 1.5);
        src.stop(t + dur);
        return src;
    }

    /* -------------------------------------------------------- instruments */

    /* Bell: a pure fundamental with inharmonic overtones that die at once. */
    function bell(rig, freq, t, vel, long) {
        var b = bus(rig, 0.42 * vel, 0.7);
        var d = long ? 2.8 : 1.1;
        partial(rig, b, 'sine', freq, t, 1, 0.002, d);
        partial(rig, b, 'sine', freq * 2.756, t, 0.38, 0.001, d * 0.28);
        partial(rig, b, 'sine', freq * 5.404, t, 0.17, 0.001, d * 0.12);
        partial(rig, b, 'sine', freq * 2, t, 0.12, 0.002, d * 0.5);
    }

    /* Tubular bell: the chime of a clock tower. */
    function chime(rig, freq, t, vel) {
        var b = bus(rig, 0.28 * vel, 0.9);
        [[1, 0.5, 3.6], [2, 1, 3.0], [3.01, 0.6, 2.4], [4.17, 0.4, 1.7], [5.43, 0.25, 1.2], [6.8, 0.15, 0.8]]
            .forEach(function (p) { partial(rig, b, 'sine', freq * p[0], t, p[1], 0.004, p[2]); });
    }

    /* Sleigh bells: a handful of little bells shaken together. */
    var JINGLES = [2637, 3136, 3729, 4435, 5274, 6272, 7459];
    function sleigh(rig, t, vel) {
        var b = bus(rig, 0.3 * vel, 0.4);
        JINGLES.forEach(function (f, i) {
            partial(rig, b, 'sine', f * (1 + ((i * 37) % 7 - 3) * 0.004), t + (i % 3) * 0.004, 0.5, 0.001, 0.09 + (i % 4) * 0.025);
        });
        var hp = rig.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6500;
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        noiseSrc(rig, t, 0.1).connect(hp);
        hp.connect(g); g.connect(b);
    }

    function shakes(rig, t, n, gap, vel) {
        for (var i = 0; i < n; i++) { sleigh(rig, t + i * gap, vel * (i % 2 ? 0.7 : 1)); }
    }

    /* Brass: three saws a few cents apart through a filter that opens as the
       note speaks. `bright` is how far it opens: low for the dark stabs,
       high for a fanfare. */
    function brass(rig, freq, t, dur, vel, glideTo, bright) {
        var b = bus(rig, 0.15 * vel, 0.5);
        var top = (bright || 1) * (2200 + 1200 * vel);
        var f = rig.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 1.4;
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(top, t + 0.07);
        f.frequency.exponentialRampToValueAtTime(Math.max(500, top * 0.4), t + dur);
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1, t + 0.035);
        g.gain.setValueAtTime(0.85, t + Math.max(0.05, dur - 0.1));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
        f.connect(g); g.connect(b);
        [-8, 0, 7].forEach(function (cents) {
            var o = rig.ctx.createOscillator();
            o.type = 'sawtooth';
            o.detune.value = cents;
            o.frequency.setValueAtTime(freq, t);
            if (glideTo) { o.frequency.exponentialRampToValueAtTime(glideTo, t + dur); }
            o.connect(f);
            o.start(t);
            o.stop(t + dur + 0.2);
        });
    }

    /* Strings: a slow section. `trem` is tremolo speed, an LFO on the gain;
       `swell` makes the note grow all the way through instead of settling. */
    function strings(rig, freq, t, dur, vel, trem, swell) {
        var b = bus(rig, 0.085 * vel, 0.75);
        var f = rig.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(swell ? 700 : 1500, t);
        if (swell) { f.frequency.linearRampToValueAtTime(2600, t + dur); }
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        if (swell) {
            g.gain.linearRampToValueAtTime(0.35, t + dur * 0.3);
            g.gain.linearRampToValueAtTime(1, t + dur);
        } else {
            g.gain.linearRampToValueAtTime(1, t + Math.min(0.6, dur * 0.4));
            g.gain.setValueAtTime(1, t + Math.max(0.1, dur - 0.2));
        }
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
        f.connect(g);
        if (trem) {
            var tg = rig.ctx.createGain();
            tg.gain.value = 0.65;
            var lfo = rig.ctx.createOscillator();
            lfo.frequency.value = trem;
            var depth = rig.ctx.createGain();
            depth.gain.value = 0.35;
            lfo.connect(depth); depth.connect(tg.gain);
            g.connect(tg); tg.connect(b);
            lfo.start(t); lfo.stop(t + dur + 0.3);
        } else {
            g.connect(b);
        }
        [-11, -4, 5, 12].forEach(function (cents) {
            var o = rig.ctx.createOscillator();
            o.type = 'sawtooth';
            o.detune.value = cents;
            o.frequency.value = freq;
            o.connect(f);
            o.start(t);
            o.stop(t + dur + 0.3);
        });
    }

    /* Sub: the floor of the room. A sine with a second harmonic, so it is
       still there on laptop speakers that cannot reach the fundamental. */
    function sub(rig, freq, t, dur, vel) {
        var b = bus(rig, 0.4 * vel, 0.15);
        [[1, 1], [2, 0.35], [3, 0.12]].forEach(function (p) {
            var o = rig.ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = freq * p[0];
            var g = rig.ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(p[1], t + Math.min(0.08, dur * 0.2));
            g.gain.setValueAtTime(p[1], t + dur * 0.6);
            g.gain.linearRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(b);
            o.start(t); o.stop(t + dur + 0.05);
        });
    }

    /* The pulse under a question: a short, dark synth-bass note. */
    function pulse(rig, freq, t, vel) {
        var b = bus(rig, 0.4 * vel, 0.2);
        var f = rig.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 3;
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(140, t + 0.22);
        f.connect(b);
        partial(rig, f, 'sawtooth', freq, t, 0.8, 0.004, 0.26);
        partial(rig, f, 'square', freq / 2, t, 0.5, 0.004, 0.3);
    }

    /* Harp: a plucked string with some shine. */
    function harp(rig, freq, t, vel) {
        var b = bus(rig, 0.36 * vel, 0.7);
        var f = rig.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(4200, t);
        f.frequency.exponentialRampToValueAtTime(700, t + 0.7);
        f.connect(b);
        partial(rig, f, 'triangle', freq, t, 1, 0.003, 1.3);
        partial(rig, f, 'sawtooth', freq, t, 0.25, 0.002, 0.3);
        partial(rig, f, 'sine', freq * 2, t, 0.2, 0.002, 0.6);
    }

    /* Timpani: a sine that falls a little as it rings, with a skin thump. */
    function timp(rig, freq, t, vel) {
        var b = bus(rig, 0.62 * vel, 0.6);
        var o = partial(rig, b, 'sine', freq, t, 1, 0.004, 1.1);
        o.frequency.setValueAtTime(freq * 1.25, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
        partial(rig, b, 'sine', freq * 1.5, t, 0.3, 0.003, 0.4);
        partial(rig, b, 'sine', freq * 2, t, 0.25, 0.003, 0.5);
        var lp = rig.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        noiseSrc(rig, t, 0.1).connect(lp);
        lp.connect(g); g.connect(b);
    }

    /* A timpani roll that grows: the drum roll before anything happens. */
    function roll(rig, freq, t, dur, from, to) {
        var n = Math.max(2, Math.floor(dur / 0.065));
        for (var i = 0; i < n; i++) {
            var k = i / (n - 1);
            timp(rig, freq, t + i * 0.065, (from + (to - from) * k * k) * 0.6);
        }
    }

    /* Heartbeat: a low thud that drops in pitch, twice. Lub, dub. */
    function thud(rig, t, vel) {
        var b = bus(rig, 0.75 * vel, 0.25);
        var o = partial(rig, b, 'sine', 48, t, 1, 0.005, 0.32);
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
        var o2 = partial(rig, b, 'sine', 96, t, 0.35, 0.005, 0.2);
        o2.frequency.setValueAtTime(220, t);
        o2.frequency.exponentialRampToValueAtTime(92, t + 0.09);
    }

    function heartbeat(rig, t, vel) {
        thud(rig, t, vel);
        thud(rig, t + 0.27, vel * 0.7);
    }

    /* Clock tick: a small wooden knock. */
    function tick(rig, t, vel) {
        var b = bus(rig, 0.2 * vel, 0.5);
        partial(rig, b, 'sine', 1150, t, 1, 0.001, 0.045);
        partial(rig, b, 'triangle', 2300, t, 0.4, 0.001, 0.025);
    }

    /* Cymbal crash. */
    function crash(rig, t, vel, dur) {
        var b = bus(rig, 0.3 * vel, 0.6);
        var hp = rig.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3200;
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        noiseSrc(rig, t, dur + 0.05).connect(hp);
        hp.connect(g); g.connect(b);
    }

    /* A swell: noise that rises in pitch and level into the moment at t+dur,
       then is cut. The breath in before a hit. */
    function swell(rig, t, dur, vel) {
        var b = bus(rig, 0.3 * vel, 0.6);
        var bp = rig.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
        var g = rig.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        noiseSrc(rig, t, dur + 0.1).connect(bp);
        bp.connect(g); g.connect(b);
    }

    function chord(rig, notes, t, dur, vel, bright) {
        notes.forEach(function (n) { brass(rig, hz(n), t, dur, vel, null, bright); });
    }

    /* ------------------------------------------------------------- stings */

    var STINGS = {

        /* "Let's play." A drum roll out of the dark, three rising chords,
           and the lights come up on a major one. */
        intro: function (rig, t, festive) {
            roll(rig, hz('C2'), t, 1.15, 0.15, 1);
            swell(rig, t + 0.35, 0.85, 0.8);
            strings(rig, hz('C3'), t, 1.2, 0.9, 10, true);
            strings(rig, hz('G3'), t, 1.2, 0.8, 10, true);

            var h = t + 1.2;
            var steps = [
                [['C3', 'G3', 'C4', 'Eb4', 'G4'], 'C2', 'G4'],
                [['Ab2', 'Eb3', 'Ab3', 'C4', 'Eb4'], 'Ab1', 'Ab4'],
                [['Bb2', 'F3', 'Bb3', 'D4', 'F4'], 'Bb1', 'Bb4']
            ];
            steps.forEach(function (s, i) {
                var at = h + i * 0.52;
                chord(rig, s[0], at, 0.42, 0.85, 1);
                brass(rig, hz(s[2]) * 2, at, 0.42, 0.7, null, 1.3);
                timp(rig, hz(s[1]) * 2, at, 0.9);
                sub(rig, hz(s[1]), at, 0.5, 0.8);
            });

            var big = h + 3 * 0.52;
            chord(rig, ['C3', 'G3', 'C4', 'E4', 'G4', 'C5'], big, 2.2, 1, 1.4);
            brass(rig, hz('E5'), big, 2.2, 0.8, null, 1.5);
            brass(rig, hz('G5'), big + 0.3, 1.9, 0.7, null, 1.5);
            ['C4', 'E4', 'G4', 'C5'].forEach(function (n) { strings(rig, hz(n), big, 2.4, 1); });
            timp(rig, hz('C2'), big, 1);
            sub(rig, hz('C1') * 2, big, 2.2, 1);
            crash(rig, big, 1, 2.6);
            bell(rig, hz('C6'), big, 0.8, true);
            bell(rig, hz('G6'), big + 0.12, 0.6, true);
            roll(rig, hz('C2'), big + 1.3, 0.8, 0.3, 0.9);
            timp(rig, hz('C2'), big + 2.15, 1);
            if (festive) {
                chime(rig, hz('C4'), big, 0.9);
                shakes(rig, big, 14, 0.11, 0.8);
            }
            return 6.4;
        },

        /* An answer locked in. A breath in, then one enormous low hit that
           hangs in the room. */
        lock: function (rig, t, festive) {
            swell(rig, t, 0.42, 0.9);
            var h = t + 0.42;
            timp(rig, hz('C2'), h, 1);
            thud(rig, h, 1);
            sub(rig, hz('C2') / 2 * 2, h, 1.6, 1);
            chord(rig, ['C2', 'C3', 'G3'], h, 0.38, 1, 0.8);
            strings(rig, hz('C3'), h, 2.4, 1, 9);
            strings(rig, hz('Db3'), h, 2.4, 0.7, 9);
            strings(rig, hz('G3'), h, 2.4, 0.8, 9);
            crash(rig, h, 0.5, 1.8);
            if (festive) { chime(rig, hz('C3'), h, 0.8); }
            return 3.2;
        },

        /* Right. A three-note run up into a wall of major brass, a cymbal,
           and a second lift on top of it. */
        correct: function (rig, t, festive) {
            ['G4', 'C5', 'E5'].forEach(function (n, i) {
                brass(rig, hz(n), t + i * 0.1, 0.11, 0.8, null, 1.4);
                brass(rig, hz(n) / 2, t + i * 0.1, 0.11, 0.6, null, 1.2);
            });
            roll(rig, hz('G2'), t, 0.3, 0.3, 0.9);

            var h = t + 0.32;
            chord(rig, ['C3', 'G3', 'C4', 'E4', 'G4'], h, 2.0, 1, 1.4);
            brass(rig, hz('G5'), h, 0.5, 0.85, null, 1.5);
            brass(rig, hz('C6'), h + 0.5, 1.5, 0.9, null, 1.5);
            brass(rig, hz('E5'), h + 0.5, 1.5, 0.7, null, 1.4);
            ['C4', 'E4', 'G4', 'C5'].forEach(function (n) { strings(rig, hz(n), h, 2.3, 1); });
            timp(rig, hz('C2'), h, 1);
            timp(rig, hz('G2'), h + 0.25, 0.6);
            timp(rig, hz('C2'), h + 0.5, 1);
            sub(rig, hz('C2'), h, 2.0, 0.9);
            crash(rig, h, 1, 2.4);
            crash(rig, h + 0.5, 0.6, 2.0);
            ['C6', 'E6', 'G6', 'C7'].forEach(function (n, i) { bell(rig, hz(n), h + 0.5 + i * 0.07, 0.6, true); });
            if (festive) {
                shakes(rig, h, 12, 0.1, 0.9);
                chime(rig, hz('C4'), h + 0.5, 0.8);
            }
            return 3.4;
        },

        /* Wrong. Not a raspberry: the floor going. Two falling low-brass
           chords, each sagging as it sounds, and a long dark tail. */
        wrong: function (rig, t, festive) {
            var falls = [['Eb3', 'D3'], ['Gb3', 'F3'], ['A3', 'Ab3'], ['Eb2', 'D2']];
            falls.forEach(function (p) { brass(rig, hz(p[0]), t, 0.5, 0.9, hz(p[1]), 0.7); });
            timp(rig, hz('Eb2'), t, 0.9);

            var h = t + 0.58;
            [['D3', 'C3'], ['F3', 'Eb3'], ['Ab3', 'G3'], ['D2', 'C2']].forEach(function (p) {
                brass(rig, hz(p[0]), h, 2.0, 1, hz(p[1]), 0.65);
            });
            timp(rig, hz('C2'), h, 1);
            thud(rig, h, 1);
            sub(rig, hz('C2'), h, 2.4, 1);
            strings(rig, hz('C3'), h, 2.6, 0.9);
            strings(rig, hz('Eb3'), h, 2.6, 0.8);
            strings(rig, hz('Gb3'), h, 2.6, 0.6);
            timp(rig, hz('C2'), h + 1.1, 0.5);
            if (festive) { chime(rig, hz('C3'), h, 0.7); }
            return 3.8;
        },

        /* A lifeline. A harp running up something unresolved, and a chord
           that hangs there asking the question. */
        lifeline: function (rig, t, festive) {
            ['C4', 'Eb4', 'G4', 'Bb4', 'D5', 'G5', 'Bb5', 'D6', 'G6'].forEach(function (n, i) {
                harp(rig, hz(n), t + i * 0.065, 0.6 + i * 0.045);
            });
            var h = t + 0.6;
            ['Ab3', 'C4', 'Eb4', 'G4'].forEach(function (n) { strings(rig, hz(n), h, 2.0, 0.9); });
            sub(rig, hz('Ab2'), h, 1.8, 0.6);
            bell(rig, hz('G6'), h, 0.5, true);
            bell(rig, hz('D7'), h + 0.15, 0.35, true);
            tick(rig, h + 0.5, 0.6); tick(rig, h + 1.0, 0.6); tick(rig, h + 1.5, 0.6);
            if (festive) { shakes(rig, t, 8, 0.065, 0.55); }
            return 3.0;
        },

        /* The winner. Plain: a full fanfare. Festive: the same forces
           playing "Joy to the World" downstairs and back to the top. */
        winner: function (rig, t, festive) {
            var beat = 0.24;
            var line = festive
                ? [['C6', 2], ['B5', 1.5], ['A5', 0.5], ['G5', 3], ['F5', 1], ['E5', 2], ['D5', 2], ['C5', 3]]
                : [['G4', 1], ['G4', 0.5], ['G4', 0.5], ['C5', 2], ['E5', 1], ['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['G5', 1], ['C6', 3]];
            var at = t;
            line.forEach(function (n) {
                var len = n[1] * beat;
                brass(rig, hz(n[0]), at, len * 0.92, 0.95, null, 1.5);
                brass(rig, hz(n[0]) / 2, at, len * 0.92, 0.7, null, 1.2);
                if (festive) { bell(rig, hz(n[0]), at, 0.6, len > 0.5); }
                at += len;
            });
            var total = at - t;

            /* Harmony and drums on the bar lines, whichever tune it is. */
            var bars = festive
                ? [['C3', 0], ['G2', 4], ['F2', 7], ['G2', 10]]
                : [['C3', 0], ['C3', 2], ['F2', 6], ['G2', 9]];
            bars.forEach(function (b) {
                var bt = t + b[1] * beat;
                timp(rig, hz(b[0]), bt, 0.9);
                sub(rig, hz(b[0]) / 2 * 2, bt, beat * 2.5, 0.7);
                strings(rig, hz(b[0]) * 2, bt, beat * 3, 0.9);
                strings(rig, hz(b[0]) * 3, bt, beat * 3, 0.7);
            });
            crash(rig, t, 0.9, 2.2);
            if (festive) { for (var i = 0; i * beat < total; i++) { sleigh(rig, t + i * beat, i % 2 ? 0.45 : 0.8); } }

            /* The last chord: everything, with a roll under it and a final
               stroke to finish. */
            var end = t + total;
            roll(rig, hz('G2'), end - beat * 2, beat * 2, 0.3, 1);
            chord(rig, ['C3', 'G3', 'C4', 'E4', 'G4', 'C5'], end, 2.6, 1, 1.5);
            brass(rig, hz('E5'), end, 2.6, 0.85, null, 1.5);
            brass(rig, hz('G5'), end, 2.6, 0.8, null, 1.5);
            brass(rig, hz('C6'), end + 0.35, 2.25, 0.85, null, 1.5);
            ['C4', 'E4', 'G4', 'C5', 'E5'].forEach(function (n) { strings(rig, hz(n), end, 2.9, 1); });
            timp(rig, hz('C2'), end, 1);
            sub(rig, hz('C2'), end, 2.6, 1);
            crash(rig, end, 1, 3.0);
            roll(rig, hz('C2'), end + 1.2, 1.2, 0.3, 1);
            timp(rig, hz('C2'), end + 2.45, 1);
            crash(rig, end + 2.45, 0.8, 2.0);
            ['C6', 'E6', 'G6', 'C7'].forEach(function (n, i) { bell(rig, hz(n), end + i * 0.09, 0.6, true); });
            if (festive) {
                chime(rig, hz('C4'), end, 1);
                shakes(rig, end, 20, 0.1, 0.9);
            }
            return total + 4.8;
        }
    };

    /* -------------------------------------------------------------- loops */

    /* Each loop is a function that schedules ONE BAR at a time, so it can run
       for as long as the host leaves it on, plus the length of that bar. */
    var LOOPS = {

        /* The bed under a question. 72 to the minute in C minor: a bass
           pulse on every quaver, a clock ticking on the beat, low strings
           holding the chord, and a bell figure that never quite settles. The
           fourth bar leans on the dominant so the phrase asks instead of
           answering, which is why it can go round all night. */
        question: {
            bar: (60 / 72) * 4,
            play: function (rig, t, n, festive) {
                var beat = 60 / 72;
                var p = n % 4;
                var root = ['C2', 'C2', 'Ab1', 'G1'][p];
                var pad = [['C3', 'Eb3', 'G3'], ['C3', 'Eb3', 'G3'], ['Ab2', 'C3', 'Eb3'], ['G2', 'B2', 'D3']][p];
                var motif = [['G5', 'Eb5'], ['G5', 'C5'], ['Ab5', 'Eb5'], ['G5', 'D5']][p];

                for (var q = 0; q < 8; q++) {
                    pulse(rig, hz(root) * 2, t + q * beat / 2, q % 4 === 0 ? 1 : (q % 2 ? 0.45 : 0.7));
                }
                for (var b = 0; b < 4; b++) {
                    tick(rig, t + b * beat, 0.9);
                    tick(rig, t + (b + 0.5) * beat, 0.4);
                }
                pad.forEach(function (nn) { strings(rig, hz(nn), t, beat * 4, 0.85, p === 3 ? 7 : 0); });
                sub(rig, hz(root), t, beat * 4, 0.55);
                bell(rig, hz(motif[0]), t + beat * 2, 0.32, true);
                bell(rig, hz(motif[1]), t + beat * 3, 0.26, true);
                if (p === 3) { timp(rig, hz('G2'), t + beat * 3.5, 0.45); }
                if (festive) {
                    sleigh(rig, t + beat * 1, 0.22);
                    sleigh(rig, t + beat * 3, 0.22);
                    if (p === 0) { chime(rig, hz('C4'), t, 0.4); }
                }
            }
        },

        /* The wait, after the answer is in. One heartbeat a second and
           almost nothing else: a drone, strings shivering on a cluster that
           tightens every other bar, one thin high note that will not go
           away, and a drum roll rising into each repeat. */
        suspense: {
            bar: 4,
            play: function (rig, t, n, festive) {
                var p = n % 2;
                for (var b = 0; b < 4; b++) { heartbeat(rig, t + b, 1); }
                sub(rig, hz('C2'), t, 4, 0.6);
                var cluster = p === 0 ? ['C3', 'G3', 'Ab3'] : ['C3', 'F#3', 'G3', 'B3'];
                cluster.forEach(function (nn) { strings(rig, hz(nn), t, 4, p ? 1 : 0.85, 11, true); });
                strings(rig, hz('G6'), t, 4, 0.22, 0);
                tick(rig, t + 0.5, 0.35); tick(rig, t + 1.5, 0.35); tick(rig, t + 2.5, 0.35); tick(rig, t + 3.5, 0.35);
                if (p === 1) {
                    roll(rig, hz('C2'), t + 2.6, 1.4, 0.1, 0.85);
                    swell(rig, t + 3.0, 1.0, 0.5);
                }
                if (festive) {
                    if (p === 0) { chime(rig, hz('C3'), t, 0.5); }
                    shakes(rig, t + 3.5, 4, 0.12, 0.2);
                }
            }
        }
    };

    /* The soundboard, in the order the buttons sit. */
    var CUES = [
        { id: 'intro',    label: 'Intro' },
        { id: 'question', label: 'Question', loop: true },
        { id: 'lifeline', label: 'Lifeline' },
        { id: 'lock',     label: 'Final answer' },
        { id: 'suspense', label: 'Suspense', loop: true },
        { id: 'correct',  label: 'Right' },
        { id: 'wrong',    label: 'Wrong' },
        { id: 'winner',   label: 'Winner' }
    ];

    /* ---------------------------------------------------------- live side */

    var live = null;            /* the rig on the real AudioContext */
    var festive = false;
    var loop = null;            /* { id, timer, gain, verbGain, next, nextTime } */

    function rig() {
        if (!AC) { return null; }
        if (!live) {
            try { live = makeRig(new AC()); } catch (err) { return null; }
        }
        /* Suspended until a tap, and again after the phone has been locked.
           Every press is a tap, so this is the moment. */
        if (live.ctx.state !== 'running' && live.ctx.resume) {
            live.ctx.resume().catch(function () {});
        }
        return live;
    }

    function stopLoop() {
        if (!loop) { return; }
        clearInterval(loop.timer);
        var l = loop;
        loop = null;
        if (!live) { return; }
        var now = live.ctx.currentTime;
        [l.gain, l.verbGain].forEach(function (g) {
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(g.gain.value, now);
            g.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        });
        setTimeout(function () {
            try { l.gain.disconnect(); l.verbGain.disconnect(); } catch (err) {}
        }, 600);
    }

    /* A loop is scheduled a little ahead of the clock from a timer, bar by
       bar, through faders of its own (one for the dry sound, one for its
       send to the room) so it can be pulled out in a quarter of a second
       however many notes are still ringing. */
    function startLoop(id) {
        var r = rig();
        if (!r) { return; }
        var def = LOOPS[id];

        var fader = r.ctx.createGain();
        fader.gain.value = 0.9;
        fader.connect(r.dry);
        var verbFader = r.ctx.createGain();
        verbFader.gain.value = 1;
        verbFader.connect(r.verb);
        var subRig = { ctx: r.ctx, dry: fader, verb: verbFader, noise: r.noise };

        var mine = loop = { id: id, gain: fader, verbGain: verbFader, next: 0, nextTime: r.ctx.currentTime + 0.08 };
        var fest = festive;

        function pump() {
            if (loop !== mine) { return; }
            while (mine.nextTime < r.ctx.currentTime + 0.6) {
                try { def.play(subRig, mine.nextTime, mine.next, fest); } catch (err) {}
                mine.next++;
                mine.nextTime += def.bar;
            }
        }
        pump();
        mine.timer = setInterval(pump, 150);
    }

    /* One button press. A loop's button starts it, or stops it if it is the
       one running; starting one loop ends the other. A sting plays over
       whatever is on, except Right, Wrong, Intro and Winner, which take the
       room: the bed stops as they land, as it does on the television. */
    var TAKES_ROOM = { correct: 1, wrong: 1, intro: 1, winner: 1 };

    function press(id) {
        if (LOOPS[id]) {
            var was = loop && loop.id;
            stopLoop();
            if (was !== id) { startLoop(id); }
            return;
        }
        if (!STINGS[id]) { return; }
        if (TAKES_ROOM[id]) { stopLoop(); }
        var r = rig();
        if (!r) { return; }
        try { STINGS[id](r, r.ctx.currentTime + 0.03, festive); } catch (err) { /* sound is a nicety */ }
    }

    /* Renders a sting, or `seconds` of a loop, to a buffer. */
    function render(id, seconds, fest) {
        if (!OAC) { return Promise.reject(new Error('no OfflineAudioContext')); }
        var sr = 44100;
        var secs = seconds || 6;
        var ctx = new OAC(2, Math.floor(sr * secs), sr);
        var r = makeRig(ctx);
        var f = fest === undefined ? festive : fest;
        if (LOOPS[id]) {
            for (var b = 0; b * LOOPS[id].bar < secs; b++) { LOOPS[id].play(r, 0.05 + b * LOOPS[id].bar, b, f); }
        } else {
            STINGS[id](r, 0.05, f);
        }
        return ctx.startRendering();
    }

    window.QuizAudio = {
        cues: CUES,
        press: press,
        looping: function () { return loop ? loop.id : ''; },
        stop: stopLoop,
        setFestive: function (v) { festive = !!v; },
        render: render
    };
})();

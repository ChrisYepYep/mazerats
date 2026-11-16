/* Quiz Night's sound: the cues behind the soundboard.
 *
 * NOTHING HERE PLAYS ON ITS OWN (16 Nov 2026, the host's call). The quiz
 * makes no sound by itself; every cue is a button on the soundboard at the
 * foot of the screen, pressed by the host when the moment wants it. Two of
 * them are loops, and a loop runs until its button is pressed again.
 *
 * The cues are RECORDINGS OF AN ORCHESTRA, in assets/quiz-audio/, made by
 * tools/quiz-audio-build.js from public-domain samples. They were first
 * synthesised here in the browser, and the host's verdict was "a bit
 * saw-synth heavy" — which it was: sawtooth waves through a filter, standing
 * in for brass and strings. This file used to hold those instruments. It now
 * holds a player, and the scores live in the build tool.
 *
 * The one thing still made here is the Christmas dressing: sleigh bells and
 * a chime laid over a cue when the Christmas quiz is on. Those are sines and
 * a breath of noise, they never sounded like a synth, and making them live
 * means one set of recordings serves both kinds of quiz. (The winner's
 * fanfare is the exception: its Christmas version is a different tune, so it
 * is a different file.)
 *
 * The files are fetched when the quiz starts, not when a button is pressed,
 * so the first press of a cue is as prompt as the tenth. A press that beats
 * its file plays as soon as the file is in.
 *
 *   QuizAudio.cues              [{ id, label, loop }] in board order
 *   QuizAudio.preload()         fetch and decode every cue
 *   QuizAudio.press(id)         play a sting, or toggle a loop
 *   QuizAudio.looping()         id of the loop running, or ''
 *   QuizAudio.stop()            silence any loop
 *   QuizAudio.setFestive(bool)
 */
(function () {
    'use strict';

    var AC = window.AudioContext || window.webkitAudioContext;
    var BASE = 'assets/quiz-audio/';

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
    var IS_LOOP = { question: 1, suspense: 1 };
    var FILES = ['intro', 'question', 'lifeline', 'lock', 'suspense', 'correct', 'wrong', 'winner', 'winner-xmas'];

    var ctx = null;
    var out = null;             /* master gain */
    var buffers = {};           /* file id -> AudioBuffer */
    var loading = {};           /* file id -> Promise */
    var festive = false;
    var loop = null;            /* { id, src, gain, timer } */
    var noise = null;

    function context() {
        if (!AC) { return null; }
        if (!ctx) {
            try { ctx = new AC(); } catch (err) { return null; }
            out = ctx.createGain();
            out.gain.value = 0.95;
            out.connect(ctx.destination);
        }
        return ctx;
    }

    /* Suspended until a tap, and again after the phone has been locked.
       Every press is a tap, so a press is the moment to wake it. */
    function wake() {
        var c = context();
        if (c && c.state !== 'running' && c.resume) { c.resume().catch(function () {}); }
        return c;
    }

    function fetchCue(id) {
        if (loading[id]) { return loading[id]; }
        var c = context();
        if (!c) { return Promise.reject(new Error('no audio')); }
        loading[id] = fetch(BASE + id + '.wav')
            .then(function (res) {
                if (!res.ok) { throw new Error(id + ' ' + res.status); }
                return res.arrayBuffer();
            })
            .then(function (data) {
                /* The callback form, for the Safaris that have no promise. */
                return new Promise(function (ok, bad) { c.decodeAudioData(data, ok, bad); });
            })
            .then(function (buf) { buffers[id] = buf; return buf; })
            .catch(function (err) {
                /* Forgotten, so a later press tries again: a dropped
                   connection should cost one press, not the evening. */
                delete loading[id];
                throw err;
            });
        return loading[id];
    }

    function preload() {
        FILES.forEach(function (id) { fetchCue(id).catch(function () {}); });
    }

    /* ---------------------------------------------- the Christmas dressing */

    function tone(freq, t, peak, attack, decay, dest) {
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + attack + decay + 0.05);
    }

    /* Sleigh bells: a handful of little bells each ringing at its own high
       pitch, shaken together, with a breath of noise for the rattle. */
    var JINGLES = [2637, 3136, 3729, 4435, 5274, 6272, 7459];
    function sleigh(t, vel, dest) {
        var b = ctx.createGain();
        b.gain.value = 0.09 * vel;
        b.connect(dest);
        JINGLES.forEach(function (f, i) {
            tone(f * (1 + ((i * 37) % 7 - 3) * 0.004), t + (i % 3) * 0.004, 0.5, 0.001, 0.09 + (i % 4) * 0.025, b);
        });
        if (!noise) {
            noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            var d = noise.getChannelData(0);
            for (var k = 0; k < d.length; k++) { d[k] = Math.random() * 2 - 1; }
        }
        var src = ctx.createBufferSource();
        src.buffer = noise;
        var hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6500;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        src.connect(hp); hp.connect(g); g.connect(b);
        src.start(t, Math.random() * 0.8);
        src.stop(t + 0.1);
    }

    function shakes(t, n, gap, vel, dest) {
        for (var i = 0; i < n; i++) { sleigh(t + i * gap, vel * (i % 2 ? 0.7 : 1), dest); }
    }

    /* A church-tower chime. */
    function chime(freq, t, vel, dest) {
        var b = ctx.createGain();
        b.gain.value = 0.05 * vel;
        b.connect(dest);
        [[1, 0.5, 3.6], [2, 1, 3.0], [3.01, 0.6, 2.4], [4.17, 0.4, 1.7], [5.43, 0.25, 1.2]]
            .forEach(function (p) { tone(freq * p[0], t, p[1], 0.004, p[2], b); });
    }

    /* What goes over each cue when the Christmas quiz is on, timed against
       the recording: the bells arrive with the orchestra's hit, not before. */
    var DRESS = {
        intro:    function (t, d) { shakes(t + 2.87, 16, 0.11, 0.9, d); chime(261.6, t + 2.87, 1, d); },
        lock:     function (t, d) { chime(130.8, t + 0.5, 1, d); },
        correct:  function (t, d) { shakes(t + 0.4, 14, 0.1, 1, d); chime(261.6, t + 0.94, 0.9, d); },
        wrong:    function (t, d) { chime(130.8, t + 0.66, 1, d); },
        lifeline: function (t, d) { shakes(t + 0.05, 10, 0.07, 0.6, d); },
        winner:   function (t, d) {
            for (var i = 0; i < 15; i++) { sleigh(t + 0.05 + i * 0.25, i % 2 ? 0.5 : 0.9, d); }
            shakes(t + 3.8, 22, 0.1, 1, d);
            chime(261.6, t + 3.8, 1, d);
        }
    };

    /* One bar of dressing for a loop, `n` counting bars from 0. */
    var DRESS_LOOP = {
        question: { bar: (60 / 72) * 4, play: function (t, n, d) {
            var beat = 60 / 72;
            sleigh(t + beat, 0.35, d);
            sleigh(t + beat * 3, 0.35, d);
            if (n % 4 === 0) { chime(261.6, t, 0.5, d); }
        } },
        suspense: { bar: 4, play: function (t, n, d) {
            if (n % 2 === 0) { chime(130.8, t, 0.6, d); }
            shakes(t + 3.5, 4, 0.12, 0.3, d);
        } }
    };

    /* ----------------------------------------------------------- playing */

    function stopLoop() {
        if (!loop) { return; }
        var l = loop;
        loop = null;
        clearInterval(l.timer);
        if (!ctx || !l.gain) { return; }
        var now = ctx.currentTime;
        l.gain.gain.cancelScheduledValues(now);
        l.gain.gain.setValueAtTime(l.gain.gain.value, now);
        l.gain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
        if (l.src) { try { l.src.stop(now + 0.35); } catch (err) {} }
        setTimeout(function () { try { l.gain.disconnect(); } catch (err) {} }, 700);
    }

    /* A loop plays through a fader of its own, which the dressing shares, so
       the lot can be pulled out in a third of a second. */
    function startLoop(id) {
        var c = wake();
        if (!c) { return; }
        var mine = loop = { id: id, src: null, gain: null, timer: 0 };
        var fest = festive;

        fetchCue(id).then(function (buf) {
            if (loop !== mine) { return; }          /* stopped while loading */
            var g = c.createGain();
            g.gain.setValueAtTime(0.0001, c.currentTime);
            g.gain.linearRampToValueAtTime(1, c.currentTime + 0.25);
            g.connect(out);
            var src = c.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            src.connect(g);
            var t0 = c.currentTime + 0.05;
            src.start(t0);
            mine.src = src;
            mine.gain = g;

            var dress = fest && DRESS_LOOP[id];
            if (!dress) { return; }
            var next = 0, nextTime = t0;
            function pump() {
                if (loop !== mine) { return; }
                while (nextTime < c.currentTime + 0.6) {
                    try { dress.play(nextTime, next, g); } catch (err) {}
                    next++;
                    nextTime += dress.bar;
                }
            }
            pump();
            mine.timer = setInterval(pump, 150);
        }).catch(function () {
            if (loop === mine) { loop = null; }
        });
    }

    function playSting(id) {
        var c = wake();
        if (!c) { return; }
        var fest = festive;
        var file = (id === 'winner' && fest) ? 'winner-xmas' : id;
        fetchCue(file).then(function (buf) {
            var src = c.createBufferSource();
            src.buffer = buf;
            src.connect(out);
            var t = c.currentTime + 0.03;
            src.start(t);
            if (fest && DRESS[id]) {
                try { DRESS[id](t, out); } catch (err) { /* dressing only */ }
            }
        }).catch(function () { /* sound is a nicety */ });
    }

    /* One button press. A loop's button starts it, or stops it if it is the
       one running; starting one loop ends the other. A sting plays over
       whatever is on, except Right, Wrong, Intro and Winner, which take the
       room: the bed stops as they land, as it does on the television. */
    var TAKES_ROOM = { correct: 1, wrong: 1, intro: 1, winner: 1 };

    function press(id) {
        if (IS_LOOP[id]) {
            var was = loop && loop.id;
            stopLoop();
            if (was !== id) { startLoop(id); }
            return;
        }
        if (TAKES_ROOM[id]) { stopLoop(); }
        playSting(id);
    }

    window.QuizAudio = {
        cues: CUES,
        preload: preload,
        press: press,
        looping: function () { return loop ? loop.id : ''; },
        stop: stopLoop,
        setFestive: function (v) { festive = !!v; },
        /* For checking only: which files are decoded, and how long each is. */
        loaded: function () {
            var o = {};
            Object.keys(buffers).forEach(function (k) { o[k] = +buffers[k].duration.toFixed(2); });
            return o;
        }
    };
})();

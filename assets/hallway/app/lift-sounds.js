/* The lift's sounds, made live and kept quiet: nothing bright, nothing sudden. Doors are a soft felted slide with a low wooden settle at the end. The ride is a
   slow warm hum you feel more than hear. Arrival is two low, rounded notes that swell in and fade, with no ding on the front of them.
   LiftSounds.doors(), .ride(seconds), .arrive() */
"use strict";
(function () {
    let ctx = null, out = null, noise = null;
    function start() {
        if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        ctx = new AC();
        out = ctx.createGain(); out.gain.value = .9;
        const soft = ctx.createBiquadFilter(); soft.type = "lowpass"; soft.frequency.value = 1400; soft.Q.value = .3;
        out.connect(soft); soft.connect(ctx.destination);
        /* brown noise: warm, no hiss */
        const n = ctx.sampleRate * 3, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
        for (let i = 0; i < n; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
        noise = buf;
        return true;
    }
    function hush(at, peak, attack, hold, release) {
        const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + attack); g.gain.setValueAtTime(peak, at + attack + hold); g.gain.linearRampToValueAtTime(0, at + attack + hold + release); g.connect(out); return g;
    }
    function felt(at, dur, from, to, peak) {
        const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.Q.value = .2; f.frequency.setValueAtTime(from, at); f.frequency.linearRampToValueAtTime(to, at + dur);
        s.connect(f); f.connect(hush(at, peak, dur * .35, dur * .3, dur * .35)); s.start(at, Math.random() * 2); s.stop(at + dur + .05);
    }
    function tone(at, freq, peak, attack, release) {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
        o.connect(f); f.connect(hush(at, peak, attack, 0, release)); o.start(at); o.stop(at + attack + release + .05);
    }
    window.LiftSounds = {
        doors() {
            if (!start()) return; const t = ctx.currentTime + .02;
            felt(t, 1.15, 180, 320, .17);
            tone(t + 1.05, 92, .045, .03, .5);          // the doors settle, low and soft
        },
        ride(seconds) {
            if (!start()) return; const t = ctx.currentTime + .02, s = seconds || 3;
            felt(t, s, 90, 150, .1);
            tone(t, 62, .03, s * .4, s * .6);
            tone(t, 93.5, .014, s * .45, s * .55);
        },
        arrive() {
            if (!start()) return; const t = ctx.currentTime + .02;
            tone(t, 293.66, .022, .28, 1.5);
            tone(t + .22, 392, .018, .32, 1.7);
        }
    };
})();

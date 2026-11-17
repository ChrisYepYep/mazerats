/* Makes the quiz's soundboard cues, played by a real orchestra.
 *
 *     node tools/quiz-audio-build.js            every cue
 *     node tools/quiz-audio-build.js wrong lock  only those
 *
 * Writes assets/quiz-audio/<cue>.wav, which ARE kept in git and are what
 * /quiz plays (js/quiz-audio.js).
 *
 * Why this exists (16 Nov 2026). The cues were first synthesised in the
 * browser, and the host's verdict was "a bit saw-synth heavy": the brass and
 * strings were sawtooth waves through a filter, and no amount of filter makes
 * a sawtooth a trombone. So they are scored here for an orchestra and played
 * by recordings of one: the same VSCO 2 Community Edition samples (public
 * domain, CC0) the Scout's Trail epics use, from
 * tools/ariadne-editor/samples/. That folder is NOT in git (171 MB); make it
 * with `node tools/ariadne-editor/orchestra.js --fetch` if it is missing.
 * The finished cues are small, so they are committed and the samples need
 * never ship.
 *
 * (Later the same day the host asked for "more synthy sounds, especially on
 * the suspense, but not horrible saw sounds", so there is a synthesiser in
 * here too, beside the orchestra: see "synths" below. It has no sawtooth in
 * it, on purpose.)
 *
 * It is a tiny offline sampler: each note picks the nearest recording of its
 * instrument, repitches it by playing it faster or slower, shapes it with an
 * envelope, and adds it to a stereo mix with a send to one shared hall
 * (a Freeverb). No dependencies. The style is the big television quiz —
 * original music, nothing copied.
 *
 * Loops are rendered twice round and the SECOND pass is kept, so the hall's
 * tail from the end of the bar is already under its beginning and the loop
 * point cannot be heard.
 *
 * 32 kHz stereo, 16-bit. Lower than CD on purpose: there are about seventy
 * seconds of it, WAV is the one format every phone decodes, and nothing in a
 * quiz sting lives above 16 kHz.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SAMPLES = path.join(__dirname, 'ariadne-editor', 'samples');
const OUT = process.env.SOLO ? path.join(require('os').tmpdir(), 'quiz-audio-solo-' + process.env.SOLO) : path.join(ROOT, 'assets', 'quiz-audio');
const SR = 32000;

/* For checking the balance without ears: SOLO=synth or SOLO=orchestra in the
   environment renders only that half (the level printed is before the final
   levelling is meaningful, so compare the two, do not ship them). */
const SOLO = process.env.SOLO || '';
if (SOLO) { console.log('SOLO ' + SOLO + ': writing to the scratch folder, not assets'); }

if (!fs.existsSync(path.join(SAMPLES, 'manifest.json'))) {
    console.error('No samples at ' + SAMPLES + '\nMake them first: node tools/ariadne-editor/orchestra.js --fetch');
    process.exit(1);
}
const MAN = JSON.parse(fs.readFileSync(path.join(SAMPLES, 'manifest.json'), 'utf8'));

/* ------------------------------------------------------------ samples */

const cache = new Map();

/* A 16-bit mono WAV as floats, with where its loudest moment is (for
   swells, which are timed to land on it). */
function load(rel) {
    if (cache.has(rel)) { return cache.get(rel); }
    const b = fs.readFileSync(path.join(SAMPLES, rel));
    let at = 12, fmt = null, data = null;
    while (at + 8 <= b.length) {
        const id = b.toString('ascii', at, at + 4);
        const len = b.readUInt32LE(at + 4);
        if (id === 'fmt ') { fmt = { ch: b.readUInt16LE(at + 10), sr: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) }; }
        if (id === 'data') { data = b.subarray(at + 8, Math.min(b.length, at + 8 + len)); }
        at += 8 + len + (len & 1);
    }
    if (!fmt || !data || fmt.bits !== 16) { throw new Error('unreadable sample ' + rel); }
    const n = Math.floor(data.length / 2 / fmt.ch);
    const x = new Float32Array(n);
    let peak = 0, peakAt = 0;
    for (let i = 0; i < n; i++) {
        let v = 0;
        for (let c = 0; c < fmt.ch; c++) { v += data.readInt16LE((i * fmt.ch + c) * 2); }
        x[i] = v / fmt.ch / 32768;
    }
    /* Loudest 50 ms, not loudest sample: a click is not the top of a swell. */
    const win = Math.floor(fmt.sr * 0.05);
    let acc = 0;
    for (let i = 0; i < n; i++) {
        acc += x[i] * x[i];
        if (i >= win) { acc -= x[i - win] * x[i - win]; }
        if (acc > peak) { peak = acc; peakAt = i - win / 2; }
    }
    const s = { x, sr: fmt.sr, peakAt: Math.max(0, peakAt) / fmt.sr };
    cache.set(rel, s);
    return s;
}

/* How loud each instrument sits in the hall: the PEAK its loud recordings
   are brought to. Peak, not average level. The first version balanced on
   the manifest's RMS figures, and a drum (one spike and a long quiet tail)
   or a twelve-second cymbal swell has almost no RMS, so the timpani came
   out five times the brass and the swell twenty-five times. Measured from
   the recordings themselves, so the balance needs no listening to set:
   the sections level with each other, the drums over them by about half
   again, the small bright things under. */
const SIT = {
    violins: 0.34, violas: 0.3, cellos: 0.34, basses: 0.34,
    violinSpic: 0.3, celloSpic: 0.36,
    horns: 0.36, trumpets: 0.36, trombones: 0.38, tuba: 0.38,
    flute: 0.2, oboe: 0.2,
    timpani: 0.62, timpRoll: 0.5, bassDrum: 0.66, snare: 0.4, snareRoll: 0.34,
    cymbal: 0.42, cymSwell: 0.36, gong: 0.42,
    piano: 0.46, harp: 0.34, glock: 0.26
};
const CAL = {};
for (const [id, list] of Object.entries(MAN.instruments)) {
    const top = Math.max(...list.map(s => s.layer));
    const loud = list.filter(s => s.layer === top);
    let sum = 0;
    for (const s of loud) {
        const x = load(s.f).x;
        let pk = 0;
        for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) { pk = v; } }
        sum += pk;
    }
    CAL[id] = (SIT[id] || 0.3) / (sum / loud.length);
}

/* The recording to use: the dynamic layer the note's strength asks for,
   then the nearest pitch. `alt` takes the next nearest instead, which is how
   one trumpet becomes two different players. */
function pick(inst, midi, vel, o) {
    const list = MAN.instruments[inst];
    if (!list) { throw new Error('no instrument ' + inst); }
    const layers = [...new Set(list.map(s => s.layer))].sort((a, b) => a - b);
    const want = o.layer !== undefined ? o.layer
        : layers[Math.min(layers.length - 1, Math.floor(vel * layers.length * 0.999))];
    const pool = list.filter(s => s.layer === want);
    if (pool[0].m === undefined) { return pool[(o.i || 0) % pool.length]; }
    const near = pool.slice().sort((a, b) => Math.abs(a.m - midi) - Math.abs(b.m - midi));
    return near[Math.min(near.length - 1, o.alt || 0)];
}

/* ---------------------------------------------------------------- mix */

let dryL, dryR, send, LEN;

function begin(seconds) {
    LEN = Math.ceil(seconds * SR);
    dryL = new Float32Array(LEN);
    dryR = new Float32Array(LEN);
    send = new Float32Array(LEN);
}

/* One note. t and dur in seconds, vel 0..1.
   o: a (attack s), r (release s), pan (-1..1), send (0..1), from/to (a
   level ramp across the note, for crescendos), detune (cents), alt, layer,
   i (which recording, for unpitched), land (true: time the recording so its
   loudest moment falls on t+dur, and cut it there), bend (semitones the
   note slides by across its length: negative falls). */
function note(inst, midi, t, dur, vel, o) {
    if (SOLO === 'synth') { return; }
    o = o || {};
    const s = pick(inst, midi, vel, o);
    const smp = load(s.f);
    const pitched = s.m !== undefined;
    const semis = pitched ? (midi - s.m) - (s.cents || 0) / 100 + (o.detune || 0) / 100 : (o.detune || 0) / 100;
    const step = Math.pow(2, semis / 12) * smp.sr / SR;       /* source samples per output sample */

    let srcStart = 0;
    if (o.land) {
        /* Start far enough into the recording that its peak arrives at the
           end of the note. */
        srcStart = Math.max(0, smp.peakAt * smp.sr - dur * SR * step);
    }

    const a = o.a !== undefined ? o.a : 0.008;
    const r = o.r !== undefined ? o.r : 0.3;
    const from = o.from !== undefined ? o.from : 1;
    const to = o.to !== undefined ? o.to : 1;
    const g = vel * CAL[inst] * (o.gain || 1);
    const pan = o.pan || 0;
    const gl = g * Math.cos((pan + 1) * Math.PI / 4);
    const gr = g * Math.sin((pan + 1) * Math.PI / 4);
    const sd = (o.send !== undefined ? o.send : 0.35) * g;

    const i0 = Math.round(t * SR);
    const nHold = Math.round(dur * SR);
    const nRel = Math.round(r * SR);
    const nAtt = Math.max(1, Math.round(a * SR));
    const total = nHold + nRel;

    const bend = o.bend || 0;
    let pos = srcStart;
    for (let k = 0; k < total; k++) {
        const out = i0 + k;
        /* The read position is walked, not multiplied out, so the speed can
           change under it: that is all a slide is. */
        const here = pos;
        pos += bend ? step * Math.pow(2, bend * (k / total) / 12) : step;
        if (out < 0) { continue; }
        if (out >= LEN) { break; }
        const p = Math.floor(here);
        if (p + 1 >= smp.x.length) { break; }
        const f = here - p;
        let v = smp.x[p] * (1 - f) + smp.x[p + 1] * f;

        let env = k < nAtt ? k / nAtt : 1;
        if (k >= nHold) {
            const q = (k - nHold) / nRel;
            env *= (1 - q) * (1 - q);
        }
        const ramp = from + (to - from) * Math.min(1, k / Math.max(1, nHold));
        v *= env * ramp;

        dryL[out] += v * gl;
        dryR[out] += v * gr;
        send[out] += v * sd;
    }
}

/* The floor of the room: a plain sine with two soft harmonics, under a hit.
   The one made sound left, because a concert bass drum has no pitch and a
   television hit wants one. */
function sub(hzv, t, dur, vel) {
    const i0 = Math.round(t * SR), n = Math.round(dur * SR);
    for (let k = 0; k < n; k++) {
        const out = i0 + k;
        if (out < 0 || out >= LEN) { continue; }
        const x = k / SR;
        const env = Math.min(1, x / 0.03) * Math.pow(1 - k / n, 1.5);
        const v = (Math.sin(2 * Math.PI * hzv * x) + 0.3 * Math.sin(4 * Math.PI * hzv * x) + 0.1 * Math.sin(6 * Math.PI * hzv * x)) * env * vel * 0.16;
        dryL[out] += v; dryR[out] += v; send[out] += v * 0.1;
    }
}

/* A tone that slides from one pitch to another: the whine of something big
   being switched off. A sine with a little second harmonic. */
function slide(f0, f1, t, dur, vel) {
    const i0 = Math.round(t * SR), n = Math.round(dur * SR);
    let ph = 0;
    for (let k = 0; k < n; k++) {
        const out = i0 + k;
        const q = k / n;
        const fr = f0 * Math.pow(f1 / f0, q);
        ph += 2 * Math.PI * fr / SR;
        if (out < 0 || out >= LEN) { continue; }
        const env = Math.min(1, k / (0.02 * SR)) * Math.pow(1 - q, 0.8);
        const v = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env * vel * 0.12;
        dryL[out] += v; dryR[out] += v; send[out] += v * 0.5;
    }
}

/* Air rushing out: noise through a low-pass that closes from f0 to f1. */
function rush(f0, f1, t, dur, vel) {
    const i0 = Math.round(t * SR), n = Math.round(dur * SR);
    let seed = 987654321, lp1 = 0, lp2 = 0;
    for (let k = 0; k < n; k++) {
        const out = i0 + k;
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const w = seed / 4294967296 * 2 - 1;
        const q = k / n;
        const fc = f0 * Math.pow(f1 / f0, q);
        const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
        lp1 += (w - lp1) * a;
        lp2 += (lp1 - lp2) * a;
        if (out < 0 || out >= LEN) { continue; }
        const env = Math.min(1, k / (0.03 * SR)) * Math.pow(1 - q, 1.2);
        const v = lp2 * env * vel * 0.5;
        dryL[out] += v * 0.9; dryR[out] += v; send[out] += v * 0.6;
    }
}

/* ------------------------------------------------------------- synths */

/* The synthesiser, asked for by the host after the orchestra went in ("make
   it more synthy sounds, especially on the suspense, but not horrible saw
   sounds", 16 Nov 2026). The television quiz this is styled on is, at
   heart, a synthesiser record with an orchestra on top, and a pulse wants a
   machine to play it.

   The rule that keeps these from being the saws that were thrown out: NO
   SAWTOOTH, and nothing bright left unfiltered. Every voice is built from
   sines and triangles, or from a square with only its first few harmonics,
   and each goes through a low-pass that is mostly shut. They are warm and
   round by construction. */

/* A two-pole low-pass (Chamberlin's state-variable filter), one sample at a
   time. Stable for the cutoffs used here, all far below the sample rate. */
function lowpass() {
    let lo = 0, band = 0;
    return function (x, cutoff, res) {
        const fq = 2 * Math.sin(Math.PI * Math.min(cutoff, SR * 0.22) / SR);
        lo += fq * band;
        const hi = x - lo - res * band;
        band += fq * hi;
        return lo;
    };
}

/* A square wave with only harmonics 1, 3, 5 and 7: hollow, like a square,
   without the edge of one. */
function softSquare(ph) {
    return Math.sin(ph) + Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5 + Math.sin(7 * ph) / 7;
}
const tri = ph => (2 / Math.PI) * Math.asin(Math.sin(ph));

function put(out, v, pan, sendAmt) {
    if (SOLO === 'orchestra') { return; }
    if (out < 0 || out >= LEN) { return; }
    dryL[out] += v * Math.cos((pan + 1) * Math.PI / 4) * 1.414;
    dryR[out] += v * Math.sin((pan + 1) * Math.PI / 4) * 1.414;
    send[out] += v * sendAmt;
}

/* Synth bass: the pulse. A soft square and a triangle an octave down,
   through a filter that opens on the note and closes behind it, so each
   one goes "dum" and not "bzz". `open` is how far the filter opens (Hz). */
function synBass(midi, t, dur, vel, open) {
    const f0 = hz(midi);
    const i0 = Math.round(t * SR), n = Math.round((dur + 0.12) * SR);
    const lp = lowpass();
    const top = open || 700;
    let ph = 0;
    for (let k = 0; k < n; k++) {
        ph += 2 * Math.PI * f0 / SR;
        const x = k / SR;
        const cutoff = 110 + top * Math.exp(-x / 0.09);
        const raw = softSquare(ph) * 0.6 + tri(ph / 2) * 0.9;
        const amp = Math.min(1, k / (0.004 * SR)) * Math.exp(-x / (dur * 0.9)) * (x > dur ? Math.max(0, 1 - (x - dur) / 0.12) : 1);
        put(i0 + k, lp(raw, cutoff, 0.55) * amp * vel * 0.2, 0, 0.12);
    }
}

/* Synth pad: three voices a few cents apart, each a sine with a little
   triangle and a soft octave, swelling in slowly. With `pump` (a beat
   length in seconds) its level dips on every beat and swells back, which is
   the breathing of a pad ducked under a kick drum: the single most
   "television thriller" sound there is, and what makes a held chord
   pulsate. */
function synPad(notes, t, dur, vel, o) {
    o = o || {};
    const i0 = Math.round(t * SR), n = Math.round((dur + 0.5) * SR);
    const att = o.a !== undefined ? o.a : 0.5;
    notes.forEach((nn, vi) => {
        const base = hz(typeof nn === 'string' ? m(nn) : nn);
        [-7, 0, 6].forEach((cents, di) => {
            const fr = base * Math.pow(2, cents / 1200);
            const pan = (di - 1) * 0.6 + (vi % 2 ? 0.1 : -0.1);
            const lp = lowpass();
            let ph = vi * 1.3 + di * 2.1;
            for (let k = 0; k < n; k++) {
                ph += 2 * Math.PI * fr / SR;
                const x = k / SR;
                let amp = Math.min(1, x / att);
                if (x > dur) { amp *= Math.max(0, 1 - (x - dur) / 0.5); }
                if (o.from !== undefined) { amp *= o.from + (o.to - o.from) * Math.min(1, x / dur); }
                if (o.pump) {
                    const q = (x % o.pump) / o.pump;
                    amp *= 0.22 + 0.78 * Math.pow(q, 0.6);
                }
                const raw = Math.sin(ph) + 0.35 * tri(ph) + 0.2 * Math.sin(2 * ph) + 0.08 * softSquare(ph);
                const cutoff = (o.dark ? 500 : 900) + (o.open || 0) * Math.min(1, x / dur);
                put(i0 + k, lp(raw, cutoff, 0.9) * amp * vel * 0.045, pan, 0.55);
            }
        });
    });
}

/* Synth pluck: a glassy electric-piano note, by frequency modulation (one
   sine bending another, the bend dying away fast), with two echoes after
   it. The echoes are what make it a synth and not a glockenspiel. */
function synPluck(midi, t, vel, o) {
    o = o || {};
    const fr = hz(midi);
    const echo = o.echo || 0;
    [[0, 1, o.pan || 0], [echo, 0.42, -(o.pan || 0.4)], [echo * 2, 0.2, o.pan || 0.4]].forEach((tap, ti) => {
        if (ti > 0 && !echo) { return; }
        const i0 = Math.round((t + tap[0]) * SR), n = Math.round(0.9 * SR);
        let ph = 0, mp = 0;
        for (let k = 0; k < n; k++) {
            const x = k / SR;
            mp += 2 * Math.PI * fr * 2 / SR;
            ph += 2 * Math.PI * fr / SR;
            const index = 1.6 * Math.exp(-x / 0.07);
            const amp = Math.min(1, k / (0.003 * SR)) * Math.exp(-x / 0.28);
            put(i0 + k, Math.sin(ph + index * Math.sin(mp)) * amp * vel * tap[1] * 0.15, tap[2], 0.45);
        }
    });
}

/* Synth kick: a sine that drops from a knock to a thud. The pulse you feel. */
function thump(t, vel) {
    const i0 = Math.round(t * SR), n = Math.round(0.34 * SR);
    let ph = 0;
    for (let k = 0; k < n; k++) {
        const x = k / SR;
        const fr = 44 + 110 * Math.exp(-x / 0.035);
        ph += 2 * Math.PI * fr / SR;
        const amp = Math.min(1, k / (0.002 * SR)) * Math.exp(-x / 0.13);
        put(i0 + k, (Math.sin(ph) + 0.2 * Math.sin(2 * ph)) * amp * vel * 0.42, 0, 0.08);
    }
}

/* A riser: air building up into a moment, the opposite of rush(). */
function riser(f0, f1, t, dur, vel) {
    const i0 = Math.round(t * SR), n = Math.round(dur * SR);
    let seed = 192837465, lp1 = 0, lp2 = 0;
    for (let k = 0; k < n; k++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const w = seed / 4294967296 * 2 - 1;
        const q = k / n;
        const fc = f0 * Math.pow(f1 / f0, q);
        const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
        lp1 += (w - lp1) * a;
        lp2 += (lp1 - lp2) * a;
        const env = q * q * Math.min(1, (n - k) / (0.02 * SR));
        put(i0 + k, lp2 * env * vel * 0.45, 0.1, 0.6);
    }
}

/* ------------------------------------------------------------ the hall */

/* Freeverb: eight damped combs into four allpasses, per side, the right
   side's delays a little longer so the hall has width. */
function hall(room, damp) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const alls = [556, 441, 341, 225];
    const k = SR / 44100;
    const wetL = new Float32Array(LEN), wetR = new Float32Array(LEN);
    [[wetL, 0], [wetR, 23]].forEach(([wet, spread]) => {
        const cb = combs.map(n => ({ buf: new Float32Array(Math.round((n + spread) * k)), i: 0, lp: 0 }));
        const ap = alls.map(n => ({ buf: new Float32Array(Math.round((n + spread) * k)), i: 0 }));
        for (let n = 0; n < LEN; n++) {
            const x = send[n] * 0.015;
            let y = 0;
            for (const c of cb) {
                const o = c.buf[c.i];
                c.lp = o * (1 - damp) + c.lp * damp;
                c.buf[c.i] = x + c.lp * room;
                if (++c.i >= c.buf.length) { c.i = 0; }
                y += o;
            }
            for (const a of ap) {
                const b = a.buf[a.i];
                const o = b - y;
                a.buf[a.i] = y + b * 0.5;
                if (++a.i >= a.buf.length) { a.i = 0; }
                y = o;
            }
            wet[n] = y;
        }
    });
    return [wetL, wetR];
}

/* ------------------------------------------------------------- scoring */

const SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function m(name) {
    const x = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    return (parseInt(x[3], 10) + 1) * 12 + SEMIS[x[1]] + (x[2] === '#' ? 1 : x[2] === 'b' ? -1 : 0);
}
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

/* Strings: each note goes to the desk whose range it is in. Slow bow on,
   slow bow off. */
function strings(notes, t, dur, vel, o) {
    o = o || {};
    notes.forEach((n, i) => {
        const k = typeof n === 'string' ? m(n) : n;
        const inst = k < 40 ? 'basses' : k < 55 ? 'cellos' : k < 67 ? 'violas' : 'violins';
        const pan = inst === 'violins' ? -0.45 : inst === 'violas' ? 0.1 : inst === 'cellos' ? 0.4 : 0.55;
        note(inst, k, t, dur, vel, Object.assign({ a: 0.14, r: 0.6, pan, send: 0.5 }, o));
        /* A second desk, a few cents off: one recording is a section, two
           is a bigger one. */
        note(inst, k, t + 0.02, dur, vel * 0.7, Object.assign({ a: 0.18, r: 0.6, pan: pan * 0.5, send: 0.5, alt: 1, detune: i % 2 ? 6 : -6 }, o));
    });
}

/* Brass: tuba, trombones, horns, trumpets by range, two players to a note. */
function brass(notes, t, dur, vel, o) {
    o = o || {};
    notes.forEach((n, i) => {
        const k = typeof n === 'string' ? m(n) : n;
        const inst = k < 41 ? 'tuba' : k < 55 ? 'trombones' : k < 65 ? 'horns' : 'trumpets';
        const pan = inst === 'trumpets' ? 0.3 : inst === 'horns' ? -0.35 : inst === 'trombones' ? 0.45 : 0.15;
        note(inst, k, t, dur, vel, Object.assign({ a: 0.012, r: 0.22, pan, send: 0.42 }, o));
        note(inst, k, t + 0.012, dur, vel * 0.8, Object.assign({ a: 0.02, r: 0.22, pan: pan - 0.15, send: 0.42, alt: 1, detune: i % 2 ? -5 : 5 }, o));
    });
}

const timp = (n, t, vel) => note('timpani', m(n), t, 2.2, vel, { r: 0.8, send: 0.5, pan: -0.1 });
const troll = (n, t, dur, from, to, vel) => note('timpRoll', m(n), t, dur, vel || 1, { a: 0.05, r: 0.12, from, to, send: 0.5, pan: -0.1 });
const bd = (t, vel) => note('bassDrum', 0, t, 2.5, vel, { r: 0.8, send: 0.35 });
const cym = (t, vel, dur) => note('cymbal', 0, t, dur || 3.5, vel, { r: 1.2, send: 0.45, pan: 0.2 });
const gong = (t, vel, dur) => note('gong', 0, t, dur || 5, vel, { r: 1.5, send: 0.5, pan: -0.2 });
/* A cymbal swell that arrives at t, having started `lead` seconds before. */
const swell = (t, lead, vel) => note('cymSwell', 0, t - lead, lead, vel, { a: 0.05, r: 0.35, land: true, from: 0.25, to: 1, send: 0.5, pan: 0.2 });
const sroll = (t, dur, from, to, vel) => note('snareRoll', 0, t, dur, vel || 1, { a: 0.03, r: 0.1, from, to, send: 0.4 });
const piano = (n, t, dur, vel, o) => note('piano', m(n), t, dur, vel, Object.assign({ r: 0.5, send: 0.4 }, o || {}));
const harp = (n, t, vel, o) => note('harp', m(n), t, 2.5, vel, Object.assign({ r: 1.2, send: 0.55, pan: -0.5 }, o || {}));
const glock = (n, t, vel) => note('glock', m(n), t, 2.5, vel, { r: 1, send: 0.6, pan: 0.35 });
const spic = (n, t, vel, o) => {
    const k = m(n);
    note(k < 55 ? 'celloSpic' : 'violinSpic', k, t, 0.5, vel, Object.assign({ r: 0.4, send: 0.4, pan: k < 55 ? 0.35 : -0.4 }, o || {}));
};

/* The full orchestra on one chord: `low` is its bass note name's letter
   part, the rest is spelled out by the caller. */
function tutti(t, dur, vel, bassN, brassN, stringN) {
    brass(brassN, t, dur, vel);
    strings(stringN, t, dur + 0.2, vel);
    timp(bassN, t, vel);
    bd(t, vel * 0.8);
    sub(hz(m(bassN) - 12), t, Math.min(2.5, dur), vel);
}

/* ---------------------------------------------------------------- cues */

const CUES = {

    /* "Let's play." A roll out of the dark, three rising chords, and the
       lights come up on a major one. */
    intro: { len: 7.4, play() {
        troll('C3', 0.05, 1.2, 0.12, 1);
        swell(1.25, 1.1, 0.8);
        strings(['C2', 'G2', 'C3'], 0.05, 1.15, 0.8, { from: 0.2, to: 1 });

        const h = 1.25, gap = 0.54;
        tutti(h, 0.4, 0.85, 'C3', ['C2', 'C3', 'G3', 'Eb4', 'G4', 'C5'], ['C3', 'G3', 'Eb4', 'G4', 'C5']);
        tutti(h + gap, 0.4, 0.9, 'Ab2', ['Ab1', 'Ab2', 'Eb3', 'C4', 'Ab4', 'Eb5'], ['Ab2', 'Eb3', 'C4', 'Ab4', 'Eb5']);
        tutti(h + 2 * gap, 0.4, 0.95, 'Bb2', ['Bb1', 'Bb2', 'F3', 'D4', 'Bb4', 'F5'], ['Bb2', 'F3', 'D4', 'Bb4', 'F5']);

        const big = h + 3 * gap;
        tutti(big, 2.5, 1, 'C3', ['C2', 'C3', 'G3', 'E4', 'G4', 'C5', 'E5', 'G5'], ['C2', 'C3', 'G3', 'E4', 'C5', 'G5', 'C6']);
        cym(big, 1);
        ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => glock(n, big + i * 0.08, 0.7));
        ['C3', 'G3', 'C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach((n, i) => harp(n, big + i * 0.035, 0.7));
        brass(['C6'], big + 0.45, 2.05, 0.9);
        troll('C3', big + 1.4, 1.05, 0.2, 1);
        timp('C3', big + 2.5, 1);
        bd(big + 2.5, 0.9);
        cym(big + 2.5, 0.7, 2.5);
    } },

    /* An answer locked in. A breath in, then one enormous low hit that
       hangs in the room on a chord with a wrong note in it. */
    lock: { len: 4.6, play() {
        swell(0.5, 0.45, 0.7);
        const h = 0.5;
        bd(h, 1);
        timp('C3', h, 1);
        gong(h, 0.45, 3.5);
        sub(hz(m('C1')), h, 2.6, 1);
        piano('C1', h, 3, 1, { pan: -0.2 });
        piano('C2', h, 3, 1, { pan: 0.2 });
        brass(['C2', 'C3', 'G3'], h, 0.45, 0.9);
        strings(['C2', 'C3', 'G3', 'Db4'], h, 3.2, 0.75, { a: 0.03, from: 1, to: 0.25 });
        strings(['G5'], h + 0.4, 2.8, 0.3, { from: 0.4, to: 1 });
        /* The synth's share of the hit: a thump under the drum, a dark pad
           holding the wrong-note chord, and a tone falling away. */
        thump(h, 1);
        synPad(['C2', 'C3', 'G3', 'Db4'], h, 3.2, 1, { a: 0.02, from: 1, to: 0.2, dark: true });
        slide(220, 45, h, 2.4, 0.6);
    } },

    /* Right. Three trumpets up the chord into the whole orchestra in the
       major, with a second lift on top. */
    correct: { len: 5.0, play() {
        brass(['G4'], 0.05, 0.1, 0.8);
        brass(['C5'], 0.16, 0.1, 0.85);
        brass(['E5'], 0.27, 0.1, 0.9);
        troll('G2', 0.03, 0.34, 0.2, 0.9);

        const h = 0.4;
        tutti(h, 2.4, 1, 'C3', ['C2', 'C3', 'G3', 'E4', 'G4', 'C5', 'G5'], ['C2', 'C3', 'G3', 'E4', 'G4', 'C5', 'E5', 'G5']);
        cym(h, 1);
        timp('G2', h + 0.27, 0.6);
        timp('C3', h + 0.54, 1);
        brass(['E5', 'G5', 'C6'], h + 0.54, 1.9, 1);
        strings(['C6', 'E6'], h + 0.54, 2.0, 0.9);
        cym(h + 0.54, 0.6, 2.5);
        ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => harp(n, h + i * 0.03, 0.75));
        ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => glock(n, h + 0.54 + i * 0.07, 0.75));
    } },

    /* Wrong. Not a raspberry: the floor going. Two low-brass chords, the
       second lower and darker, a gong, and a long tail. */
    wrong: { len: 5.6, play() {
        brass(['Eb2', 'A2', 'Eb3', 'Gb3', 'A3'], 0.05, 0.5, 0.9);
        timp('Eb3', 0.05, 0.9);
        bd(0.05, 0.7);
        strings(['Eb2', 'A2', 'Gb3'], 0.05, 0.55, 0.8, { a: 0.02 });

        const h = 0.66;
        brass(['C2', 'G2', 'C3', 'Eb3', 'G3'], h, 2.6, 1, { from: 1, to: 0.35 });
        strings(['C2', 'G2', 'Eb3', 'Gb3', 'C4'], h, 3.2, 0.85, { a: 0.03, from: 1, to: 0.3 });
        timp('C3', h, 1);
        bd(h, 1);
        gong(h, 0.7, 4.5);
        sub(hz(m('C1')), h, 2.8, 1);
        piano('C1', h, 3.5, 1);
        piano('C2', h, 3.5, 0.9);
        timp('C3', h + 1.25, 0.45);
    } },

    /* A lifeline. A harp running up something unresolved, and soft strings
       that hang there asking the question. */
    lifeline: { len: 4.5, play() {
        ['C3', 'G3', 'C4', 'Eb4', 'G4', 'Bb4', 'D5', 'G5', 'Bb5', 'D6'].forEach((n, i) => {
            harp(n, 0.05 + i * 0.07, 0.6 + i * 0.04, { pan: -0.5 + i * 0.08 });
        });
        const h = 0.72;
        strings(['Ab2', 'Eb3', 'C4', 'Eb4', 'G4'], h, 2.6, 0.6, { a: 0.25, from: 0.7, to: 1 });
        glock('G6', h, 0.6);
        glock('D7', h + 0.16, 0.45);
        /* The same run again on a glassy synth, a beat behind, with echoes,
           and a pad under the strings. */
        ['G4', 'Bb4', 'D5', 'G5', 'Bb5', 'D6'].forEach((n2, i) => synPluck(m(n2), 0.3 + i * 0.07, 0.45, { echo: 0.28, pan: i % 2 ? 0.4 : -0.4 }));
        synPad(['Ab2', 'Eb3', 'C4', 'G4'], h, 2.6, 0.8, { a: 0.3 });
        note('flute', m('G5'), h + 0.1, 2.2, 0.5, { a: 0.2, r: 0.6, pan: -0.2, send: 0.55 });
        piano('Ab1', h, 3, 0.5);
        spic('G5', h + 0.9, 0.3); spic('G5', h + 1.5, 0.3); spic('G5', h + 2.1, 0.3);
    } },

    /* The lights going down, which is how a question starts (the host,
       16 Nov 2026: "a powering down kind of effect"). One hit, and then
       everything in the room falls: the strings and the low brass slide
       down more than an octave, a drum roll sinks with them, a whine winds
       down to nothing and the air goes out. What is left at the bottom is
       the low C the question bed starts on.

       The bed comes in ONE BAR after this starts (js/quiz-audio.js knows
       the same number), so this is scored to have landed by then and to
       ring on under the bed's first bar. */
    'question-in': { len: 5.6, play() {
        const fall = (60 / 72) * 4;            /* one bar: 3.33 s */
        bd(0.05, 1);
        timp('C3', 0.05, 0.9);
        piano('C1', 0.05, 4, 0.9);
        piano('C2', 0.05, 4, 0.8, { pan: 0.2 });
        gong(0.05, 0.35, 4);
        cym(0.05, 0.5, 2.5);

        /* The orchestra falling. Each desk starts on a note of C minor and
           ends well over an octave below it, getting quieter as it goes. */
        strings(['C5', 'G4', 'Eb4', 'C4', 'G3'], 0.05, fall - 0.3, 0.9, { a: 0.02, r: 0.5, bend: -17, from: 1, to: 0.25 });
        brass(['C4', 'G3', 'C3'], 0.05, fall - 0.5, 0.8, { r: 0.5, bend: -15, from: 1, to: 0.2 });
        note('timpRoll', m('C3'), 0.05, fall - 0.4, 0.8, { a: 0.02, r: 0.4, bend: -12, from: 1, to: 0.15, send: 0.5 });

        /* The machine winding down, and the air going out of the room. */
        slide(880, 55, 0.05, fall - 0.2, 0.9);
        slide(440, 36, 0.05, fall, 0.9);
        rush(9000, 120, 0.05, fall, 0.9);

        /* The bottom: the note the bed begins on. */
        sub(hz(m('C1')), fall - 0.6, 2.6, 0.7);
        strings(['C2', 'C3', 'G3'], fall - 0.8, 2.4, 0.9, { a: 0.6, r: 0.8, from: 0.4, to: 1, gain: 1.6 });
        synPad(['C2', 'C3', 'G3'], fall - 0.8, 2.4, 0.9, { a: 0.7, dark: true });
        thump(0.05, 1);
    } },

    /* The winner: a full fanfare, and one last stroke. */
    winner: { len: 9.7, play() { fanfare([
        ['G4', 1], ['G4', 0.5], ['G4', 0.5], ['C5', 2], ['E5', 1], ['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['G5', 1], ['C6', 3]
    ], [['C3', 0], ['C3', 2], ['F2', 6], ['G2', 9], ['G2', 11]], false); } },

    /* The Christmas winner: the same forces playing "Joy to the World"
       downstairs, which is old enough to belong to everybody. */
    'winner-xmas': { len: 10.0, play() { fanfare([
        ['C6', 2], ['B5', 1.5], ['A5', 0.5], ['G5', 3], ['F5', 1], ['E5', 2], ['D5', 2], ['C5', 3]
    ], [['C3', 0], ['G2', 4], ['F2', 7], ['C3', 8], ['G2', 10], ['C3', 12]], true); } }
};

/* A tune on trumpets with horns an octave under, chords and drums on the
   bar lines, then the last chord with everything in it. */
function fanfare(line, bars, bells) {
    const beat = 0.25;
    const t0 = 0.05;
    let at = t0;
    line.forEach(n => {
        const len = n[1] * beat;
        const k = m(n[0]);
        /* Trumpets, horns an octave under, trombones under those: the tune
           has to stand up to the chord it is leading to. */
        brass([k], at, len * 0.9, 1, { gain: 1.7 });
        note('horns', k - 12, at, len * 0.9, 1, { a: 0.015, r: 0.2, pan: -0.35, send: 0.42, gain: 1.6 });
        note('trombones', k - 24, at, len * 0.9, 0.9, { a: 0.015, r: 0.2, pan: 0.45, send: 0.42, gain: 1.3 });
        if (bells) { note('glock', k + 12, at, 2, 0.7, { r: 1, send: 0.6, pan: 0.35 }); }
        at += len;
    });
    const total = at - t0;

    const TRIAD = { C3: ['C3', 'G3', 'E4', 'G4'], F2: ['F2', 'C3', 'A3', 'F4'], G2: ['G2', 'D3', 'B3', 'G4'] };
    bars.forEach(b => {
        const bt = t0 + b[1] * beat;
        if (bt >= t0 + total - 0.01) { return; }
        timp(b[0], bt, 0.85);
        strings(TRIAD[b[0]], bt, beat * 3.2, 1, { a: 0.04, gain: 1.5 });
        brass([m(b[0]) - 12, m(b[0])], bt, beat * 2.5, 0.9, { gain: 1.3 });
        bd(bt, 0.5);
    });
    cym(t0, 0.9);
    sroll(t0 + total - beat * 3, beat * 3, 0.15, 1);

    const end = t0 + total;
    tutti(end, 3.0, 1, 'C3', ['C2', 'C3', 'G3', 'E4', 'G4', 'C5', 'E5', 'G5'], ['C2', 'C3', 'G3', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6']);
    cym(end, 1);
    brass(['C6'], end + 0.4, 2.6, 0.95);
    ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => harp(n, end + i * 0.03, 0.75));
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => glock(n, end + i * 0.09, 0.75));
    troll('C3', end + 1.5, 1.45, 0.2, 1);
    sroll(end + 1.5, 1.45, 0.2, 1);
    timp('C3', end + 3.0, 1);
    bd(end + 3.0, 1);
    cym(end + 3.0, 0.9, 3);
    brass(['C2', 'C3', 'G3', 'C4', 'E4', 'G4', 'C5'], end + 3.0, 0.35, 1);
    strings(['C3', 'G3', 'E4', 'C5'], end + 3.0, 0.35, 1, { a: 0.02 });
}

/* Loops. `bar` is one bar in seconds, `bars` how many make the loop;
   play(t, n) scores bar n at time t. */
const LOOPS = {

    /* The bed under a question. 72 to the minute in C minor: cellos
       bouncing the bow on every quaver, a piano low on one and three, the
       section holding the chord, a harp-and-bell figure that never settles.
       The fourth bar leans on the dominant, so the phrase asks instead of
       answering and can go round all night. */
    question: { bar: (60 / 72) * 4, bars: 4, peak: 0.5, play(t, n) {
        const beat = 60 / 72;
        const p = n % 4;
        const root = ['C', 'C', 'Ab', 'G'][p];
        const fig = [
            ['C3', 'G3', 'Eb3', 'G3', 'C3', 'G3', 'Eb3', 'G3'],
            ['C3', 'G3', 'Eb3', 'G3', 'C3', 'G3', 'F3', 'G3'],
            ['Ab2', 'Eb3', 'C3', 'Eb3', 'Ab2', 'Eb3', 'C3', 'Eb3'],
            ['G2', 'D3', 'B2', 'D3', 'G2', 'D3', 'B2', 'F3']
        ][p];
        const pad = [['C2', 'C3', 'Eb4', 'G4'], ['C2', 'C3', 'Eb4', 'G4'], ['Ab1', 'Ab2', 'Eb4', 'Ab4'], ['G1', 'G2', 'D4', 'B4']][p];
        const motif = [['G5', 'Eb5'], ['G5', 'C5'], ['Ab5', 'Eb5'], ['G5', 'D5']][p];

        /* The bouncing cellos and the held chord ARE the bed; the piano only
           marks the bar. (First render had it the other way about: a piano
           note and then nearly nothing.) */
        fig.forEach((nn, q) => spic(nn, t + q * beat / 2, q % 4 === 0 ? 0.9 : (q % 2 ? 0.6 : 0.75), { gain: 1.6 }));
        piano(root + '1', t, beat * 2, 0.45);
        piano(root + '2', t, beat * 2, 0.4, { pan: 0.2 });
        piano(root + '1', t + beat * 2, beat * 2, 0.3);
        for (let b = 0; b < 4; b++) { spic('G5', t + (b + 0.5) * beat, 0.4); }
        strings(pad, t, beat * 4 - 0.1, 0.8, { a: 0.3, r: 0.5, gain: 1.4 });
        /* A synth under the section (the host, after the orchestra went in:
           "more synthy sounds"): a soft bass on the quavers with the
           cellos, and a pad breathing once a beat under the held chord. */
        for (let q = 0; q < 8; q++) {
            synBass(m(root + '2'), t + q * beat / 2, beat * 0.4, q % 4 === 0 ? 0.8 : 0.5, 380);
        }
        synPad(pad.slice(1), t, beat * 4 - 0.08, 0.75, { pump: beat, a: 0.1 });
        synPluck(m(motif[0]), t + beat * 2, 0.45, { echo: beat * 0.75, pan: 0.4 });
        synPluck(m(motif[1]), t + beat * 3, 0.38, { echo: beat * 0.75, pan: -0.4 });
        harp(motif[0], t + beat * 2, 0.5);
        harp(motif[1], t + beat * 3, 0.42);
        glock(motif[0].replace(/\d/, d => String(+d + 1)), t + beat * 2, 0.3);
        if (p === 3) {
            timp('G2', t + beat * 3.5, 0.5);
            strings(['B4'], t + beat * 2, beat * 2 - 0.1, 0.5, { from: 0.4, to: 1 });
        }
    } },

    /* The wait, after the answer is in. A PULSE, and a synthesiser's pulse
       (the host, 16 Nov 2026, in two notes: "more of a pulsating suspense",
       then "more synthy sounds, especially on the suspense"). 104 to the
       minute, four bars, never resolving.

       The machine: a synth bass on every quaver that never leaves C, its
       filter opening wider each bar; a kick you feel more than hear on
       every beat; a pad that ducks under each kick and swells back, so the
       held chord itself breathes; and a glassy two-note figure rocking a
       semitone, with echoes.
       The orchestra, kept under it for size: low strings doubling the bass
       on the beat, a held section climbing with the pad, and a timpani roll
       and a riser that throw the fourth bar back to the first. */
    suspense: { bar: (60 / 104) * 4, bars: 4, peak: 0.68, play(t, n) {
        const beat = 60 / 104;
        const p = n % 4;
        const push = 0.75 + p * 0.08;                 /* each bar leans in harder */

        /* The pulse. */
        for (let q = 0; q < 8; q++) {
            const acc = q % 2 === 0 ? 1 : 0.62;
            synBass(m('C2'), t + q * beat / 2, beat * 0.42, acc * push, 500 + p * 260 + (q % 2 ? 0 : 200));
        }
        for (let b = 0; b < 4; b++) {
            thump(t + b * beat, b % 2 === 0 ? 1 : 0.8);
            if (b % 2 === 0) { thump(t + (b + 0.5) * beat, 0.45); }
            spic('C2', t + b * beat, 0.6 * push, { gain: 1.3 });
        }

        /* The breathing chord: it climbs a step a bar, and opens as it goes. */
        const hold = [['C3', 'G3', 'Eb4'], ['C3', 'Ab3', 'Eb4', 'G4'], ['C3', 'Ab3', 'F4', 'Ab4'], ['D3', 'B3', 'F4', 'Ab4', 'B4']][p];
        synPad(hold, t, beat * 4 - 0.05, 0.9 * push, { pump: beat, a: 0.08, open: 500 + p * 250 });
        synPad(['C2'], t, beat * 4 - 0.05, 0.8, { pump: beat, a: 0.05, dark: true });
        strings(hold, t, beat * 4 - 0.08, 0.4 * push, { a: 0.3, r: 0.35, from: 0.5, to: 1 });

        /* The itch: two notes a semitone apart, off the beat, with echoes. */
        const rock = [['G4', 'Ab4'], ['G4', 'Ab4'], ['Ab4', 'Bb4'], ['B4', 'C5']][p];
        for (let q = 0; q < 8; q++) {
            synPluck(m(rock[q % 2]), t + q * beat / 2 + beat / 4, 0.55 * push, { echo: beat * 0.75, pan: q % 2 ? 0.45 : -0.45 });
        }
        if (p % 2 === 1) { synPluck(m('G5'), t + beat * 3, 0.5, { echo: beat * 0.75, pan: 0.2 }); }

        if (p === 3) {
            troll('G2', t + beat * 2, beat * 2, 0.1, 0.7);
            riser(300, 7000, t + beat * 2, beat * 2, 0.8);
            thump(t + beat * 3.5, 0.9);
            thump(t + beat * 3.75, 1);
        }
    } }
};

/* ------------------------------------------------------------- render */

function finish(peakTo) {
    const [wl, wr] = hall(0.86, 0.3);
    const L = new Float32Array(LEN), R = new Float32Array(LEN);
    for (let i = 0; i < LEN; i++) { L[i] = dryL[i] + wl[i]; R[i] = dryR[i] + wr[i]; }
    return [L, R, peakTo];
}

function level(L, R, peakTo) {
    let pk = 0;
    for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    /* Brought up to the target, then leaned on gently: a soft knee over the
       top third, so a tutti is dense instead of merely peaky. */
    const g = pk ? (peakTo * 1.25) / pk : 1;
    const knee = x => { const a = Math.abs(x); return a < 0.6 * peakTo ? x : Math.sign(x) * (0.6 * peakTo + (peakTo * 0.4) * Math.tanh((a - 0.6 * peakTo) / (peakTo * 0.4))); };
    for (let i = 0; i < L.length; i++) { L[i] = knee(L[i] * g); R[i] = knee(R[i] * g); }
}

function writeWav(file, L, R) {
    const n = L.length;
    const b = Buffer.alloc(44 + n * 4);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
    b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(n * 4, 40);
    for (let i = 0; i < n; i++) {
        b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
        b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
    }
    fs.writeFileSync(file, b);
}

function stats(L, R) {
    let pk = 0, sq = 0;
    for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); sq += L[i] * L[i] + R[i] * R[i]; }
    return 'peak ' + pk.toFixed(2) + ' rms ' + Math.sqrt(sq / (2 * L.length)).toFixed(3);
}

fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const todo = [...Object.keys(CUES), ...Object.keys(LOOPS)].filter(id => !want.length || want.includes(id));

for (const id of todo) {
    let L, R;
    if (CUES[id]) {
        begin(CUES[id].len);
        CUES[id].play();
        [L, R] = finish();
        level(L, R, id === 'question-in' ? 0.72 : 0.9);
        /* The last 60 ms to nothing, whatever the hall is still doing. */
        const f = Math.round(0.06 * SR);
        for (let i = 0; i < f; i++) { const g = i / f; L[L.length - 1 - i] *= g; R[R.length - 1 - i] *= g; }
    } else {
        const lp = LOOPS[id];
        const one = lp.bar * lp.bars;
        const n = Math.round(one * SR);
        begin(one * 2 + 0.5);
        for (let b = 0; b < lp.bars * 2 + 1; b++) { lp.play(b * lp.bar, b); }
        const [fl, fr] = finish();
        if (SOLO) { let q = 0; for (let i = n; i < 2 * n; i++) { q += fl[i] * fl[i]; } console.log('  raw rms ' + Math.sqrt(q / n).toFixed(4)); }
        /* Keep the second time round: it has the first's tail under it. */
        L = fl.slice(n, 2 * n); R = fr.slice(n, 2 * n);
        level(L, R, lp.peak);
    }
    const file = path.join(OUT, id + '.wav');
    writeWav(file, L, R);
    console.log(id.padEnd(12), (L.length / SR).toFixed(2) + 's', stats(L, R), Math.round(fs.statSync(file).size / 1024) + ' KB');
}

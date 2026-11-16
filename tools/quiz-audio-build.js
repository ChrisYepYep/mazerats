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
const OUT = path.join(ROOT, 'assets', 'quiz-audio');
const SR = 32000;

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
   loudest moment falls on t+dur, and cut it there), keep (do not shorten). */
function note(inst, midi, t, dur, vel, o) {
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

    for (let k = 0; k < total; k++) {
        const out = i0 + k;
        if (out < 0) { continue; }
        if (out >= LEN) { break; }
        const pos = srcStart + k * step;
        const p = Math.floor(pos);
        if (p + 1 >= smp.x.length) { break; }
        const f = pos - p;
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
        note('flute', m('G5'), h + 0.1, 2.2, 0.5, { a: 0.2, r: 0.6, pan: -0.2, send: 0.55 });
        piano('Ab1', h, 3, 0.5);
        spic('G5', h + 0.9, 0.3); spic('G5', h + 1.5, 0.3); spic('G5', h + 2.1, 0.3);
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
    question: { bar: (60 / 72) * 4, bars: 4, peak: 0.6, play(t, n) {
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
        strings(pad, t, beat * 4 - 0.1, 0.8, { a: 0.3, r: 0.5, gain: 1.7 });
        harp(motif[0], t + beat * 2, 0.5);
        harp(motif[1], t + beat * 3, 0.42);
        glock(motif[0].replace(/\d/, d => String(+d + 1)), t + beat * 2, 0.3);
        if (p === 3) {
            timp('G2', t + beat * 3.5, 0.5);
            strings(['B4'], t + beat * 2, beat * 2 - 0.1, 0.5, { from: 0.4, to: 1 });
        }
    } },

    /* The wait, after the answer is in. One heartbeat a second and almost
       nothing else: basses holding a C, the section shivering up a cluster
       that tightens in the second bar, and a roll rising into the repeat. */
    suspense: { bar: 4, bars: 2, peak: 0.62, play(t, n) {
        const p = n % 2;
        for (let b = 0; b < 4; b++) {
            bd(t + b, 0.5);
            bd(t + b + 0.27, 0.32);
            sub(hz(m('C1')), t + b, 0.35, 0.8);
            sub(hz(m('C1')), t + b + 0.27, 0.3, 0.5);
        }
        strings(['C2', 'C3'], t, 3.9, 0.6, { a: 0.3 });
        const cluster = p === 0 ? ['G3', 'Ab3', 'C4', 'G4'] : ['F#3', 'G3', 'B3', 'C4', 'Ab4'];
        strings(cluster, t, 3.9, p ? 0.75 : 0.6, { a: 0.4, from: 0.3, to: 1 });
        strings(['G5'], t, 3.9, 0.3, { a: 0.5 });
        for (let b = 0; b < 4; b++) { spic('C3', t + b + 0.5, 0.3); }
        piano('C1', t, 3.5, 0.5);
        if (p === 1) {
            troll('C3', t + 2.5, 1.5, 0.08, 0.8);
            swell(t + 4, 1.3, 0.4);
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
        level(L, R, 0.9);
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
        /* Keep the second time round: it has the first's tail under it. */
        L = fl.slice(n, 2 * n); R = fr.slice(n, 2 * n);
        level(L, R, lp.peak);
    }
    const file = path.join(OUT, id + '.wav');
    writeWav(file, L, R);
    console.log(id.padEnd(12), (L.length / SR).toFixed(2) + 's', stats(L, R), Math.round(fs.statSync(file).size / 1024) + ' KB');
}

/* THE ORCHESTRA's SAMPLES, for the epic soundtracks (js/rat-race-epic.js) in
   the editor's jukebox (18 Oct 2026, the owner's: "are we able to make it
   proper professional quality, and sound as if it's being played by an actual
   real orchestra?", and of the ways to do it, "let's go with option 1": real
   recordings, free ones, played by the score as it is).

   The recordings are the Versilian Community Sample Library, VSCO 2
   Community Edition (github.com/sgossner/VSCO-2-CE), in the public domain
   (CC0): no credit owed, nothing to keep track of. Only a part of it is
   wanted (the strings, brass, timpani, harp, glockenspiel and the orchestral
   percussion, a dynamic or two of each, a note every few semitones), and that
   part made small: each recording mixed to one channel, trimmed to the note
   (from its first sound, to as long as the score holds one), its last moments
   faded, and written as 16-bit WAV. Its pitch is measured, not taken from its
   name (the library names its octaves two ways), and each instrument's
   recordings are brought to one level together, so its soft and loud ones
   keep their difference.

   What comes out (tools/ariadne-editor/samples/: the WAVs and manifest.json)
   is not kept in git (.gitignore): it is only the editor's, and this makes it
   again. Without it the epic tracks play their made-up orchestra, as before.

       node tools/ariadne-editor/orchestra.js --fetch     download what is
                                 wanted (about 650 MB) into a folder of its
                                 own beside the samples, then make them
       node tools/ariadne-editor/orchestra.js <folder>    make them from a
                                 copy of the library already downloaded */
"use strict";
const fs = require("fs"), path = require("path");

const OUT = path.join(__dirname, "samples");
const REPO = "sgossner/VSCO-2-CE", BRANCH = "master";

/* What is wanted, an instrument at a time: which recordings (by their path in the library), how long a
   note may be kept, how its dynamic is read from its name (soft first), and whether its pitch is measured
   (pitched) or it is a drum or a cymbal. */
const INSTRUMENTS = [
    { id: "violins", re: /^Strings\/Violin Section\/susVib\/.*_v([12])\.wav$/, keep: 8, pitched: true },
    // (19 Oct 2026) the violas: the middle of a string section, without which it is two thin ends
    { id: "violas", re: /^Strings\/Viola Section\/susvib\/.*_v([12])_1\.wav$/, keep: 8, pitched: true },
    { id: "cellos", re: /^Strings\/Cello Section\/susvib\/.*_v([13])_1\.wav$/, keep: 8, pitched: true },
    { id: "basses", re: /^Strings\/Solo Contrabass\/SusVib\/.*_v([13])_rr1\.wav$/, keep: 8, pitched: true },
    { id: "violinSpic", re: /^Strings\/Violin Section\/Spic\/.*_v(2)_rr1\.wav$/, keep: 1.2, pitched: true },
    { id: "celloSpic", re: /^Strings\/Cello Section\/spic\/.*_v(2)_RR1\.wav$/, keep: 1.2, pitched: true },
    // (the brass are one player each: a section is made of several, each its own recording; the horn's three dynamics give more of them)
    { id: "horns", re: /^Brass\/F Horn\/sus\/.*_v([123])_1\.wav$/, keep: 7, pitched: true },
    { id: "trumpets", re: /^Brass\/Trumpet\/sus\/.*_v([13])_rr1\.wav$/, keep: 7, pitched: true },
    { id: "trombones", re: /^Brass\/Tenor Trombone\/sus\/.*_v([13])_1\.wav$/, keep: 7, pitched: true },
    { id: "tuba", re: /^Brass\/Tuba\/sus\/.*_v([13])_rr1_Mid\.wav$/, keep: 7, pitched: true },
    // (19 Oct 2026) the woodwinds, for the orchestral version's flute and oboe
    { id: "flute", re: /^Woodwinds\/Flute\/susvib\/.*_v(1)_1\.wav$/, keep: 6, pitched: true },
    { id: "oboe", re: /^Woodwinds\/Oboe\/Vib\/.*_v([13])_Main\.wav$/, keep: 6, pitched: true },
    { id: "timpani", re: /^Percussion\/Timpani\/Timpani\d_Hit_v([34])_rr1_Sum\.wav$/, keep: 4.5, pitched: true, low: true },
    { id: "timpRoll", re: /^Percussion\/Timpani\/Rolls\/Timpani\d_Roll_v(3)_rr1_Sum\.wav$/, keep: 9, pitched: true, low: true },
    /* (19 Oct 2026, the owner's: "Make sure to add some piano :)") an upright, Ivy Audio's (in the library, free to
       pass on; its makers ask for a mention, and get one here: Simon Dalzell of Ivy Audio, and Versilian Studios):
       a note every four semitones, soft and middling. Its files are numbered, not named: number n is key 21 + 2n. */
    { id: "piano", re: /^Keys\/Upright Piano\/Player_dyn([12])_rr1_0(?:[0-3][02468]|4[024])\.wav$/, keep: 6, pitched: true, key: rel => 21 + 2 * Number(/_(\d{3})\.wav$/.exec(rel)[1]) },
    { id: "harp", re: /^Strings\/Harp\/KSHarp_[A-G]#?[1-5]_(m[fp])\.wav$/, keep: 5, pitched: true },
    { id: "glock", re: /^Percussion\/Glock\/glock_(medium)_.*\.wav$/, keep: 3.5, pitched: true },
    { id: "snare", re: /^Percussion\/Snare2-HitSN_v([37])_rr[12]_Sum\.wav$/, keep: 1.6 },
    { id: "snareRoll", re: /^Percussion\/Snare2-rollSN_v(3)_rr1_Sum\.wav$/, keep: 10 },
    { id: "cymbal", re: /^Percussion\/susCymb1-hit_(mp|fff)_rr1\.wav$/, keep: 6 },
    { id: "cymSwell", re: /^Percussion\/susCymb1-cresc-(Short|Median|Long)_v1\.wav$/, keep: 12, whole: true },
    { id: "gong", re: /^Percussion\/gongHit_(mf|f)\.wav$/, keep: 9 },
    { id: "bassDrum", re: /^VSCO 1 Percussion\/drums\/bass\/bdrum_(pp|mp|fff)_1\.wav$/, keep: 4 }
];
const LAYER = ["1", "2", "3", "4", "7", "pp", "mp", "mf", "f", "fff", "Short", "Median", "Long", "medium"];   // the dynamics (and lengths), softest first

// ---- WAV in and out
function readWav(file) {
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV: " + file);
    let o = 12, fmt = null, data = null;
    while (o + 8 <= b.length) {
        const id = b.toString("ascii", o, o + 4), sz = b.readUInt32LE(o + 4);
        if (id === "fmt ") { let tag = b.readUInt16LE(o + 8); if (tag === 0xfffe) tag = b.readUInt16LE(o + 32); fmt = { tag, ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; }
        if (id === "data") { data = b.subarray(o + 8, Math.min(b.length, o + 8 + sz)); break; }
        o += 8 + sz + (sz & 1);
    }
    if (!fmt || !data) throw new Error("no fmt or data: " + file);
    const bytes = fmt.bits / 8, n = Math.floor(data.length / (bytes * fmt.ch)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let c = 0; c < fmt.ch; c++) {
            const p = (i * fmt.ch + c) * bytes;
            let v;
            if (fmt.tag === 3) v = bytes === 4 ? data.readFloatLE(p) : data.readDoubleLE(p);
            else if (bytes === 2) v = data.readInt16LE(p) / 32768;
            else if (bytes === 3) v = (((data[p] | (data[p + 1] << 8) | (data[p + 2] << 16)) << 8) >> 8) / 8388608;
            else if (bytes === 4) v = data.readInt32LE(p) / 2147483648;
            else v = (data[p] - 128) / 128;
            sum += v;
        }
        out[i] = sum / fmt.ch;
    }
    return { sr: fmt.sr, d: out };
}
function writeWav(file, d, sr) {
    const b = Buffer.alloc(44 + d.length * 2);
    b.write("RIFF", 0, "ascii"); b.writeUInt32LE(36 + d.length * 2, 4); b.write("WAVE", 8, "ascii");
    b.write("fmt ", 12, "ascii"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write("data", 36, "ascii"); b.writeUInt32LE(d.length * 2, 40);
    for (let i = 0; i < d.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767))), 44 + i * 2);
    fs.writeFileSync(file, b);
}

/* ---- the hiss taken out (19 Oct 2026, the owner's: "Near the beginning of the hybrid track there's some odd
   background noise that sounds a bit like white noise"). A soft recording brought up to the score's level brings
   up the room and the microphones with it, the hiss under a held note: measured, the soft cellos' and basses'
   only 25 to 30 dB below the note. So each recording's own hiss is learnt from its quietest moments (before the
   player starts, or after the note has died) and taken out of it, frequency by frequency, a short stretch at a
   time (a spectral gate: what is not well above the hiss at a frequency turned down there, never to nothing,
   and eased in and out so it does not twitter). A recording with no quiet moment to learn from is left be. */
function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
        const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
                re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function denoise(d) {
    const N = 2048, H = 512, win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    if (d.length < N * 8) return { d, cut: 0 };
    // the quietest stretches (not digital silence), and is the note well above them
    const frames = [];
    for (let s = 0; s + N <= d.length; s += N / 2) { let e = 0; for (let i = 0; i < N; i++) e += d[s + i] * d[s + i]; frames.push([e / N, s]); }
    const loudest = Math.max(...frames.map(f => f[0])), quiet = frames.filter(f => f[0] > 1e-14).sort((a, b) => a[0] - b[0]).slice(0, 4);
    if (!quiet.length || quiet[quiet.length - 1][0] > loudest * 0.003) return { d, cut: 0 };   // (no stretch 25 dB under the note: nothing to learn from)
    const noise = new Float32Array(N / 2 + 1);
    for (const [, s] of quiet) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = d[s + i] * win[i]; fft(re, im); for (let k = 0; k <= N / 2; k++) noise[k] += Math.hypot(re[k], im[k]) / quiet.length; }
    const out = new Float32Array(d.length), norm = new Float32Array(d.length), gPrev = new Float32Array(N / 2 + 1).fill(1);
    let before = 0, after = 0;
    for (let s = -N + H; s < d.length; s += H) {
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) { const j = s + i; re[i] = j >= 0 && j < d.length ? d[j] * win[i] : 0; }
        fft(re, im);
        for (let k = 0; k <= N / 2; k++) {
            const mag = Math.hypot(re[k], im[k]), snr = mag / (noise[k] * 2.2 + 1e-12);
            let g = snr >= 1 ? 1 : Math.max(0.06, snr * snr);   // under the hiss (with room to spare): down, as far as it is under
            g = g > gPrev[k] ? g : gPrev[k] * 0.7 + g * 0.3;     // let go slowly, so the hiss does not twitter as it goes
            gPrev[k] = g;
            re[k] *= g; im[k] *= g; if (k > 0 && k < N / 2) { re[N - k] *= g; im[N - k] *= g; }
        }
        fft(re, im, true);
        for (let i = 0; i < N; i++) { const j = s + i; if (j >= 0 && j < d.length) { out[j] += re[i] * win[i]; norm[j] += win[i] * win[i]; } }
    }
    for (let i = 0; i < d.length; i++) { const v = norm[i] > 1e-6 ? out[i] / norm[i] : 0; before += d[i] * d[i]; after += (d[i] - v) * (d[i] - v); out[i] = v; }
    return { d: out, cut: 10 * Math.log10(before / Math.max(after, 1e-20)) };   // (how far under the whole what was taken out was, dB)
}

// ---- the note: from its first sound (a few milliseconds before), to as long as is kept, its end faded
function trim(d, sr, keep, whole) {
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    let a = 0; if (!whole) { const th = peak * 0.03; while (a < d.length && Math.abs(d[a]) < th) a++; a = Math.max(0, a - Math.round(sr * 0.004)); }
    let z = d.length; const quiet = peak * 0.0015; while (z > a && Math.abs(d[z - 1]) < quiet) z--;
    z = Math.min(z, a + Math.round(keep * sr));
    const out = d.slice(a, z), fade = Math.min(out.length >> 2, Math.round(sr * (keep > 2 ? 0.35 : 0.08)));
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
    for (let i = 0; i < Math.min(out.length, 32); i++) out[i] *= i / 32;   // no click where it was cut in
    return out;
}

/* ---- its pitch (YIN, on a stretch of the note after it has spoken), as a MIDI number with its cents: the
   name, where it has one, says which note; the measure says which octave the library meant and how true it is */
function yin(d, sr, from, lo, hi) {
    const W = 4096, tMin = Math.floor(sr / hi), tMax = Math.ceil(sr / lo);
    if (from + W + tMax >= d.length) from = Math.max(0, d.length - W - tMax - 1);
    if (from < 0) return null;
    const df = new Float32Array(tMax + 1);
    for (let t = tMin; t <= tMax; t++) { let s = 0; for (let i = 0; i < W; i++) { const x = d[from + i] - d[from + i + t]; s += x * x; } df[t] = s; }
    let run = 0, best = -1; const cm = new Float32Array(tMax + 1);
    for (let t = 1; t <= tMax; t++) { if (t < tMin) { cm[t] = 1; continue; } run += df[t]; cm[t] = df[t] * (t - tMin + 1) / (run || 1); }
    for (let t = tMin + 1; t < tMax; t++) if (cm[t] < 0.15 && cm[t] <= cm[t + 1]) { best = t; break; }
    if (best < 0) { let m = Infinity; for (let t = tMin; t <= tMax; t++) if (cm[t] < m) { m = cm[t]; best = t; } }
    const a = cm[best - 1], b = cm[best], c = cm[best + 1], sh = (a - c) / (2 * (a - 2 * b + c)) || 0;
    const f = sr / (best + Math.max(-1, Math.min(1, sh)));
    return 69 + 12 * Math.log2(f / 440);
}
/* a drum's pitch (the timpani's): YIN is fooled by a skin's partials, which are not a harmonic series. The
   note the ear takes is the principal, and a timpano is tuned so that over it ring a fifth and an octave (1.5
   and 2 times), so: the frequency between lo and hi Hz with the most power at it, its fifth and its octave
   together (on its own the loudest partial is now and then the fifth itself, as a hard stroke brings it out) */
function loudest(d, sr, from, lo, hi) {
    const W = Math.min(16384, d.length - from); if (W < 4096) return null;
    const power = f => { const w = 2 * Math.PI * f / sr; let re = 0, im = 0; for (let i = 0; i < W; i += 2) { const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W), x = d[from + i] * h; re += x * Math.cos(w * i); im += x * Math.sin(w * i); } return re * re + im * im; };
    let best = 0, bestF = null;
    for (let f = lo; f <= hi; f += 0.5) {
        const p = Math.sqrt(power(f)) + 0.7 * Math.sqrt(power(f * 1.5)) + 0.5 * Math.sqrt(power(f * 2));
        if (p > best) { best = p; bestF = f; }
    }
    for (let f = bestF - 0.5; f <= bestF + 0.5; f += 0.05) { const p = Math.sqrt(power(f)) + 0.7 * Math.sqrt(power(f * 1.5)) + 0.5 * Math.sqrt(power(f * 2)); if (p > best) { best = p; bestF = f; } }
    return 69 + 12 * Math.log2(bestF / 440);
}
const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
function nameNote(file) { const m = /_([A-G]#?)(\d)(?:_|\.)/.exec(path.basename(file)); return m ? { pc: NOTE[m[1]], oct: Number(m[2]) } : null; }

function make(src) {
    const listed = [];
    (function walk(dir, rel) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f), r = rel ? rel + "/" + f : f; if (fs.statSync(p).isDirectory()) walk(p, r); else listed.push(r); } })(src, "");
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = { made: new Date().toISOString(), source: "VSCO 2 Community Edition (CC0), github.com/" + REPO, sr: 44100, instruments: {} };
    let bytes = 0, files = 0;
    const DRUMS = {};   // each timpano's note, as its hits give it, for its rolls too
    for (const ins of INSTRUMENTS) {
        const mine = listed.filter(p => ins.re.test(p)).sort();
        if (!mine.length) { console.warn("none for " + ins.id); continue; }
        const notes = [], cuts = [];
        for (const rel of mine) {
            const { sr, d: raw } = readWav(path.join(src, rel));
            if (sr !== 44100) throw new Error("not 44.1kHz: " + rel);
            const clean = denoise(raw); cuts.push(clean.cut);
            const cut = trim(clean.d, sr, ins.keep, ins.whole);
            const layer = LAYER.indexOf(ins.re.exec(rel)[1]);
            let heard = null, named = null;
            if (ins.pitched) {
                heard = ins.low ? loudest(cut, sr, Math.round(sr * 0.08), 60, 280) : yin(cut, sr, Math.round(sr * (ins.keep > 2 ? 0.45 : 0.06)), 50, 2600);
                named = ins.key ? (k => ({ pc: k % 12, oct: Math.floor(k / 12) - 1 }))(ins.key(rel)) : nameNote(rel);
            }
            let peak = 0, ss = 0; const body = Math.min(cut.length, 44100);
            for (let i = 0; i < cut.length; i++) peak = Math.max(peak, Math.abs(cut[i]));
            for (let i = 0; i < body; i++) ss += cut[i] * cut[i];
            notes.push({ rel, cut, heard, named, m: null, cents: 0, layer, peak, rms: Math.sqrt(ss / body) });
        }
        /* which octave the library's names mean, by a vote of what is heard (one instrument's names all mean it
           the same way; a measure now and then lands an octave out, and is outvoted); then each note's own
           cents, where the measure agrees on the octave */
        if (ins.pitched) {
            const votes = {};
            for (const n of notes) if (n.named && n.heard !== null) { const k = Math.round((n.heard - (12 * (n.named.oct + 1) + n.named.pc)) / 12); votes[k] = (votes[k] || 0) + 1; }
            const k = ins.key ? 0 : Number(Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0] || 1);
            /* a drum (the timpani, named by drum not note) is the note its hardest stroke gives (measured: the
               softer ones and the rolls now and then read as another of the skin's modes), for its rolls too */
            const drum = n => (/Timpani(\d)/.exec(n.rel) || [])[1];
            if (ins.low) for (const n of notes) if (n.layer === Math.max(...notes.filter(o => drum(o) === drum(n)).map(o => o.layer)) && n.heard !== null && !(drum(n) in DRUMS)) DRUMS[drum(n)] = n.heard;
            for (const n of notes) {
                const exact = n.named ? 12 * (n.named.oct + 1 + k) + n.named.pc : ins.low && drum(n) in DRUMS ? DRUMS[drum(n)] : n.heard;
                if (exact === null) throw new Error("no pitch heard: " + n.rel);
                n.m = Math.round(exact);
                const off = n.named ? (n.heard === null ? 9 : n.heard - n.m) : exact - n.m;
                if (Math.abs(off) <= 0.5) n.cents = Math.round(off * 100);
            }
        }
        // the instrument to one level, its dynamics kept
        const top = Math.max(...notes.map(n => n.peak)), g = 0.95 / top;
        const layers = [...new Set(notes.map(n => n.layer))].sort((a, b) => a - b);
        const dir = path.join(OUT, ins.id); fs.mkdirSync(dir, { recursive: true });
        manifest.instruments[ins.id] = notes.map((n, i) => {
            for (let k = 0; k < n.cut.length; k++) n.cut[k] *= g;
            const f = ins.id + "/" + String(i).padStart(2, "0") + ".wav";
            writeWav(path.join(OUT, f), n.cut, 44100);
            bytes += 44 + n.cut.length * 2; files++;
            const e = { f, layer: layers.indexOf(n.layer), rms: +(n.rms * g).toFixed(5), len: +(n.cut.length / 44100).toFixed(3), from: n.rel };
            if (n.m !== null) { e.m = n.m; if (n.cents) e.cents = n.cents; }
            return e;
        }).sort((a, b) => (a.m || 0) - (b.m || 0) || a.layer - b.layer);
        const ms = notes.filter(n => n.m !== null).map(n => n.m);
        const hush = cuts.filter(c => c > 0);
        console.log(ins.id.padEnd(11), String(notes.length).padStart(3), "files", layers.length, "layers", ms.length ? "notes " + Math.min(...ms) + "-" + Math.max(...ms) : "", hush.length ? "hiss taken from " + hush.length + " (" + Math.min(...hush).toFixed(0) + " to " + Math.max(...hush).toFixed(0) + " dB under)" : "");
    }
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    console.log(files + " samples, " + (bytes / 1048576).toFixed(1) + " MB, in " + path.relative(process.cwd(), OUT));
}

// ---- fetching what is wanted: the library's list of files, then each wanted one, eight at a time
async function fetchAll(into) {
    const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers: { "User-Agent": "ariadne-editor" } })).json();
    const want = tree.tree.filter(e => e.type === "blob" && INSTRUMENTS.some(ins => ins.re.test(e.path)));
    console.log("fetching " + want.length + " files, " + (want.reduce((s, e) => s + e.size, 0) / 1048576).toFixed(0) + " MB");
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
        while (next < want.length) {
            const e = want[next++], to = path.join(into, e.path);
            if (fs.existsSync(to) && fs.statSync(to).size === e.size) continue;
            const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/` + e.path.split("/").map(encodeURIComponent).join("/"));
            if (!r.ok) throw new Error(r.status + " " + e.path);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.writeFileSync(to, Buffer.from(await r.arrayBuffer()));
        }
    }));
}

(async () => {
    const arg = process.argv[2];
    if (arg === "--fetch") { const into = path.join(__dirname, ".vsco"); await fetchAll(into); make(into); console.log("(the downloaded library is in " + path.relative(process.cwd(), into) + "; delete it if it is not wanted again)"); }
    else if (arg && fs.existsSync(arg)) make(arg);
    else { console.log("node tools/ariadne-editor/orchestra.js --fetch | <folder of VSCO-2-CE>"); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exitCode = 1; });

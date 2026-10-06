/* Pura Panic's soundtrack (6 Oct 2026) — an original chiptune, played live.

   In the manner of the 8-bit game music the owner pointed at (Tetris,
   Pac-Man): four voices the way those machines had them —

       lead       a square wave, a quarter on and three quarters off
       bass       a triangle wave, bouncing root to octave on every beat
       arpeggio   a thin square, running the chord, in the second half only
       drums      white noise for the hat and snare, a falling sine for the kick

   — and its own tune: eight bars in A minor that climb and settle, then
   eight in D minor that run higher and come home, round and round. No other
   game's melody is in it.

   Nothing is downloaded. Every note is made here with the Web Audio API,
   on a look-ahead clock (the standard way: a timer wakes every 25ms and
   books the notes due in the next tenth of a second on the audio clock,
   which never drifts the way timers do).

   MUFFLED (6 Oct 2026, the owner's): on the splash, the pause and the
   leaderboard the same track plays quieter and with its top cut off, as if
   from the next room — a low-pass filter on everything at about 700Hz and
   the volume down by half — and opens out when a game starts.

   THE LAMENT (6 Oct 2026, the owner's: "a sad, slow version" for the
   game-over screen). The same tune after the fall, round and round until
   the player moves on: at 70 beats a minute, the lead on a soft triangle
   instead of the bright square, every E major chord turned E minor (its G#
   dropped to G, in the chords and the melody alike), the bass one long note
   a beat, no arpeggio, no drums, and the top softened (about 2.2kHz).

   It gets quicker with the level, 138 beats a minute at level 1 to 176 by
   level 50, and plays a little run when a level goes up and a falling one
   when the game ends. It can be switched off (M, or the button on the pause
   and game-over screens), and stays off for that browser until switched
   back on.

   Browsers will not make a sound until the page has been clicked or tapped,
   so it starts from the Play button and never by itself. */
(function () {
    "use strict";

    const STORE = "mazerats_pura_music";
    const VOLUME = 0.16;

    // ---- the tune. Each bar is eight eighth-notes: a note, "-" to hold the
    // one before, "." for a rest.
    const A_LEAD = [
        "A4 - E5 - D5 E5 C5 A4",
        "A4 - - C5 F5 - E5 D5",
        "E5 - G5 E5 D5 C5 D5 E5",
        "D5 - B4 G4 B4 - D5 .",
        "A4 - C5 E5 A5 - G5 E5",
        "F5 - E5 D5 C5 - A4 C5",
        "B4 - G#4 B4 E5 - D5 B4",
        "G#4 - - - E4 - . ."
    ];
    const B_LEAD = [
        "D5 - F5 A5 G5 F5 E5 F5",
        "E5 - C5 A4 C5 E5 A5 -",
        "F5 - E5 F5 G5 - F5 E5",
        "E5 - D5 C5 G4 - . .",
        "D5 F5 A5 F5 D5 F5 A5 D6",
        "C6 - B5 A5 E5 - C5 E5",
        "B4 C5 D5 E5 G#5 - B5 -",
        "A5 - - - A4 - . ."
    ];
    const A_CHORDS = ["Am", "F", "C", "G", "Am", "F", "E", "E"];
    const B_CHORDS = ["Dm", "Am", "F", "C", "Dm", "Am", "E", "Am"];
    const CHORDS = {
        Am: { root: 45, tones: [69, 72, 76] },
        F: { root: 41, tones: [65, 69, 72] },
        C: { root: 48, tones: [72, 76, 79] },
        G: { root: 43, tones: [67, 71, 74] },
        E: { root: 40, tones: [64, 68, 71] },
        Dm: { root: 50, tones: [62, 65, 69] }
    };
    const SECTIONS = [
        { lead: A_LEAD, chords: A_CHORDS, arp: false, busy: false },
        { lead: B_LEAD, chords: B_CHORDS, arp: true, busy: true }
    ];

    const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
    function midi(name) {
        const m = /^([A-G]#?)(\d)$/.exec(name);
        return m ? 12 * (Number(m[2]) + 1) + NOTE[m[1]] : null;
    }
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

    // Each bar's lead as eight steps: { note, len } at a step, or null.
    function parseBar(bar) {
        const t = bar.trim().split(/\s+/);
        const out = new Array(8).fill(null);
        for (let i = 0; i < 8; i++) {
            const n = midi(t[i]);
            if (n === null) continue;
            let len = 1;
            while (i + len < 8 && t[i + len] === "-") len++;
            out[i] = { note: n, len };
        }
        return out;
    }
    SECTIONS.forEach(s => { s.steps = s.lead.map(parseBar); });

    // ---- sound
    let ctx = null, master = null, lowpass = null, pulse25 = null, pulse12 = null, noise = null;
    let muted = false, muffled = false, sad = false;
    const SAD_HZ = 2200;
    const MUFFLED_HZ = 700, OPEN_HZ = 20000;
    // How loud the whole thing should be right now.
    const loudness = () => (muted ? 0 : muffled ? VOLUME * 0.5 : VOLUME);
    try { muted = localStorage.getItem(STORE) === "off"; } catch (e) { /* private mode: on */ }

    function pulseWave(duty) {
        const N = 48, re = new Float32Array(N), im = new Float32Array(N);
        for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
        return ctx.createPeriodicWave(re, im);
    }

    function setup() {
        if (ctx) return true;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = loudness();
        lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.Q.value = 0.7;
        lowpass.frequency.value = muffled ? MUFFLED_HZ : OPEN_HZ;
        master.connect(lowpass);
        lowpass.connect(ctx.destination);
        pulse25 = pulseWave(0.25);
        pulse12 = pulseWave(0.125);
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noise = buf;
        return true;
    }

    function tone(at, dur, freq, kind, vol, out) {
        const o = ctx.createOscillator();
        if (kind === "triangle") o.type = "triangle";
        else o.setPeriodicWave(kind === "thin" ? pulse12 : pulse25);
        o.frequency.setValueAtTime(freq, at);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vol, at + 0.005);
        g.gain.setValueAtTime(vol * 0.8, at + Math.min(0.06, dur * 0.4));
        g.gain.linearRampToValueAtTime(0, at + dur);
        o.connect(g); g.connect(out || master);
        o.start(at); o.stop(at + dur + 0.02);
    }

    function hiss(at, dur, vol, high) {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = high;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.02);
    }

    function kick(at) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(140, at);
        o.frequency.exponentialRampToValueAtTime(45, at + 0.11);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.9, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.13);
        o.connect(g); g.connect(master);
        o.start(at); o.stop(at + 0.15);
    }

    // ---- the clock
    let timer = 0, playing = false;
    let level = 1;
    let nextAt = 0;              // when the next step sounds, on the audio clock
    let step = 0;                // eighth-note steps since the song began
    const bpm = () => sad ? 70 : Math.min(176, 138 + (Math.min(level, 50) - 1) * (38 / 49));
    const stepLen = () => 30 / bpm();   // an eighth of a beat at this tempo

    function book(at, i) {
        const bar = Math.floor(i / 8), s = i % 8;
        const section = SECTIONS[Math.floor(bar / 8) % SECTIONS.length];
        const b = bar % 8;
        const len = stepLen();
        const chord = CHORDS[section.chords[b]];

        const lead = section.steps[b][s];
        if (sad) {
            // E major's G# turned G: the minor v, in the tune and the bass's chord alike.
            const minor = (n) => (n % 12 === 8 ? n - 1 : n);
            if (lead) tone(at, lead.len * len * 0.95, hz(minor(lead.note)), "triangle", 0.5);
            if (s % 2 === 0) tone(at, len * 1.9, hz(chord.root), "triangle", 0.42);
            // A quiet chord tone under each beat, so the harmony is still there.
            if (s % 4 === 0) tone(at, len * 3.6, hz(minor(chord.tones[1])), "thin", 0.05);
            return;
        }
        if (lead) tone(at, lead.len * len * 0.92, hz(lead.note), "pulse", 0.34);

        // Bass: root, octave, root, octave — a beat each way.
        tone(at, len * 0.85, hz(chord.root + (s % 2 ? 12 : 0)), "triangle", 0.55);

        if (section.arp) {
            const t = chord.tones[[0, 1, 2, 1][s % 4]];
            tone(at, len * 0.5, hz(t + 12), "thin", 0.09);
            tone(at + len / 2, len * 0.45, hz(chord.tones[(s + 1) % 3] + 12), "thin", 0.07);
        }

        // Drums: kick on 1 and 3, snare on 2 and 4, a hat on every eighth.
        if (s === 0 || s === 4 || (section.busy && s === 5)) kick(at);
        if (s === 2 || s === 6) hiss(at, 0.12, 0.35, 1800);
        hiss(at, 0.03, s % 2 ? 0.08 : 0.14, 7000);
    }

    function tick() {
        while (nextAt < ctx.currentTime + 0.12) {
            book(nextAt, step++);
            nextAt += stepLen();
        }
    }

    /* From the top, at a level. `opts.muffled` for the splash and the
       other screens between games (see MUFFLED). */
    function start(lv, opts) {
        if (!setup()) return;
        level = lv || 1;
        step = 0;
        muffled = Boolean(opts && opts.muffled);
        sad = false;
        wake();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(loudness(), ctx.currentTime);
        lowpass.frequency.cancelScheduledValues(ctx.currentTime);
        lowpass.frequency.setValueAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, ctx.currentTime);
        nextAt = ctx.currentTime + 0.06;
        playing = true;
        clearInterval(timer);
        timer = setInterval(tick, 25);
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
       pressed. Opened from the menu that has happened; arriving straight at
       /purapanic it has not, so the splash's music waits for the first
       press anywhere on the page and starts then. */
    let waiting = false;
    function wake() {
        if (!ctx || ctx.state === "running") return;
        ctx.resume().catch(() => {});
        if (waiting) return;
        waiting = true;
        const go = () => {
            waiting = false;
            document.removeEventListener("pointerdown", go, true);
            document.removeEventListener("keydown", go, true);
            if (ctx && playing && ctx.state !== "running") ctx.resume().catch(() => {});
        };
        document.addEventListener("pointerdown", go, true);
        document.addEventListener("keydown", go, true);
    }

    function stop() {
        playing = false;
        clearInterval(timer);
    }

    // Pausing stops the audio clock itself, so nothing booked plays on.
    function pause() { if (ctx && ctx.state === "running") ctx.suspend(); }
    function resume() { if (ctx && playing && ctx.state === "suspended") wake(); }

    function setLevel(lv) { level = lv; }

    // A quick run up the chord, over the top of the tune.
    function levelUp() {
        if (!ctx || muted) return;
        const at = ctx.currentTime + 0.02;
        [69, 72, 76, 81, 84].forEach((n, i) => tone(at + i * 0.07, 0.09, hz(n), "pulse", 0.3));
        tone(at + 0.35, 0.4, hz(88), "pulse", 0.28);
    }

    /* The song stops, a slow fall plays out, and then the lament (see THE
       LAMENT) starts from the top and goes round until the screen changes:
       Play again starts the real tune afresh (start), the leaderboard the
       muffled one. Muted, the lament still keeps time, silently, so
       unmuting on this screen brings it in. */
    function gameOver() {
        stop();
        if (!setup()) return;
        wake();
        const at = ctx.currentTime + 0.05;
        if (!muted) {
            [76, 72, 69, 64, 60, 57].forEach((n, i) => tone(at + i * 0.16, 0.2, hz(n), "pulse", 0.3));
            tone(at + 0.96, 0.6, hz(45), "triangle", 0.5);
        }
        sad = true;
        muffled = false;
        step = 0;
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(loudness(), t);
        lowpass.frequency.cancelScheduledValues(t);
        lowpass.frequency.setValueAtTime(OPEN_HZ, t);
        lowpass.frequency.setValueAtTime(SAD_HZ, at + 1.6);
        nextAt = at + 1.9;
        playing = true;
        clearInterval(timer);
        timer = setInterval(tick, 25);
    }

    function setMuted(m) {
        muted = Boolean(m);
        try { localStorage.setItem(STORE, muted ? "off" : "on"); } catch (e) { /* not remembered */ }
        if (ctx) {
            master.gain.cancelScheduledValues(ctx.currentTime);
            master.gain.setTargetAtTime(loudness(), ctx.currentTime, 0.05);
        }
    }

    window.PuraMusic = {
        start, stop, pause, resume, setLevel, levelUp, gameOver, setMuted, setMuffled,
        get muted() { return muted; },
        get playing() { return playing; },
        get sad() { return sad; }
    };
    // For testing on the dev server only: how the audio clock is getting on.
    if (location.hostname === "localhost") window.PuraMusic._state = () => ({ ctx: ctx && ctx.state, time: ctx && ctx.currentTime, step, playing, muffled, sad, cutoff: lowpass && Math.round(lowpass.frequency.value), gain: master && +master.gain.value.toFixed(3) });
})();

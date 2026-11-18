/* THE RADIO: the GTA skin's car radio (19 Nov 2026, the owner's).

   Five stations, three songs each, all written for this skin and played
   live by its own synth (js/gta-tunes.js, GtaTunes), fetched the first
   time a station is picked. None of it is the games' music (the owner's,
   19 Nov 2026); the engine still knows FFAudio and RatMusic, unused. Each song goes round twice, seamlessly,
   then the station moves on to its next, in a shuffled order.

   Off on every visit until a station is picked (the owner's, 19 Nov 2026).
   The station last played is remembered on this device (mazerats_gta_radio),
   and the wheel opens on it.
   Quiet while a game's window is in front (html[data-game-front]), while the
   Hallway is open (html.hallway-open, which has its own music), or while the
   tab is hidden; it carries on as it was after. Switching on the radio never changes the games' own
   music settings: those are read, worked round and put back as they were.

   The station wheel: a ring of station logos over the dimmed page, the
   one under the pointer (or chosen with the arrow keys) lit, and its name
   and what it plays in the middle. Click, or Enter, tunes in; Esc closes.
   A change of station flashes its name across the top of the page. */
(function () {
    "use strict";

    const STATIONS = [
        // (19 Nov 2026, the owner's: Neon 108 and Pink Palms all 80s synthwave; Sewer Lo-Fi became The Bog Signal, jungle.)
        { id: "neon", name: "Neon 108", genre: "Synth-pop · ambient 80s", bg: "linear-gradient(135deg,#ff2e88,#7a2cff)",
            tracks: [["tune", "midnight", "Midnight Drive"], ["tune", "neonrain", "Neon Rain"], ["tune", "turbo", "Turbo Sunset"]] },
        // (19 Nov 2026, the owner's: no station plays Fallin' Furni's or Scout's Trail's music; Fallin' FM is now Pixel FM.)
        { id: "folk", name: "Quarry Folk", genre: "Folk-pop", bg: "linear-gradient(135deg,#7a5230,#3a2414)",
            tracks: [["tune", "lanterns", "Hillside Lanterns"], ["tune", "riverstone", "Riverstone"], ["tune", "oldmill", "Old Mill Road"]] },
        { id: "pixel", name: "Pixel FM", genre: "Chip-pop", bg: "linear-gradient(135deg,#2b6bff,#12307a)",
            tracks: [["tune", "parade", "Pixel Parade"], ["tune", "fountain", "Coin Fountain"], ["tune", "nightbus", "Night Bus Home"]] },
        { id: "palms", name: "Pink Palms", genre: "Sunny synth-pop", bg: "linear-gradient(135deg,#ffd166,#ff5fa2)",
            tracks: [["tune", "ocean", "Ocean Drive"], ["tune", "pastel", "Pastel Skyline"], ["tune", "cruise", "Sunset Cruise"]] },
        { id: "bog", name: "The Bog Signal", genre: "Jungle pop · swamp air", bg: "linear-gradient(135deg,#3d7a3a,#0f2a17)",
            tracks: [["tune", "mangrove", "Mangrove Drums"], ["tune", "frogs", "Frog Chorus"], ["tune", "canopy", "Canopy Run"]] }
    ];
    const SAVE = "mazerats_gta_radio", TRACK_MS = 150000;
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

    // ---- the engines, fetched when first needed
    const ENGINE_SRC = { ff: "/js/ff-audio.js?v=1", rat: "/js/rat-race-music.js?v=1", tune: "/js/gta-tunes.js?v=1" };
    const engineOf = (kind) => (kind === "ff" ? window.FFAudio : kind === "rat" ? window.RatMusic : window.GtaTunes);
    const engineReady = {};
    function engine(kind) {
        const have = engineOf(kind);
        if (have) return Promise.resolve(have);
        if (!engineReady[kind]) engineReady[kind] = new Promise((ok) => {
            const s = document.createElement("script");
            s.src = ENGINE_SRC[kind];
            s.onload = () => ok(engineOf(kind));
            s.onerror = () => { delete engineReady[kind]; ok(null); };
            document.head.appendChild(s);
        });
        return engineReady[kind];
    }
    // The games' own music switches, left exactly as the player set them.
    function keepSetting(key, fn) { const was = read(key); try { fn(); } finally { if (was == null) { try { localStorage.removeItem(key); } catch (e) { /* fine */ } } else write(key, was); } }

    /* THE STATIONS' LOGOS (19 Nov 2026, the owner's: "bring up the quality
       of them so they seem realistic - gta style still"). Badges, each
       drawn to r=54 round 0,0: a chrome bezel catching the light, a face
       with its own scene, curved lettering round the rim, and a gloss
       across the top, as a real station's sticker or dial badge has. */
    const LOGO_DEFS =
        `<linearGradient id="lg-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#cfc8d8"/><stop offset=".5" stop-color="#6d6478"/><stop offset=".55" stop-color="#3b3445"/><stop offset=".78" stop-color="#b9b0c4"/><stop offset="1" stop-color="#f4f0f8"/></linearGradient>` +
        `<linearGradient id="lg-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<radialGradient id="lg-vign" cx="50%" cy="50%" r="50%"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>` +
        `<clipPath id="lg-face"><circle r="46.5"/></clipPath>` +
        `<path id="lg-top" d="M-37 0 A37 37 0 0 1 37 0"/><path id="lg-bot" d="M-39 0 A39 39 0 0 0 39 0"/>` +
        `<filter id="lg-neon" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
        `<filter id="lg-drop" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity=".75"/></filter>` +
        // Neon 108
        `<radialGradient id="lg-n-face" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#3a0d5e"/><stop offset=".6" stop-color="#14062a"/><stop offset="1" stop-color="#05020c"/></radialGradient>` +
        `<linearGradient id="lg-n-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".55" stop-color="#ff7a5a"/><stop offset="1" stop-color="#ff2e88"/></linearGradient>` +
        // Pink Palms
        `<linearGradient id="lg-p-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0d5e"/><stop offset=".45" stop-color="#c02a7a"/><stop offset=".72" stop-color="#ff7a5a"/><stop offset="1" stop-color="#ffcf6e"/></linearGradient>` +
        `<linearGradient id="lg-p-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a1a6e"/><stop offset="1" stop-color="#22093a"/></linearGradient>` +
        // Quarry Folk
        `<radialGradient id="lg-q-wood" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#b57a45"/><stop offset=".6" stop-color="#7a4a24"/><stop offset="1" stop-color="#3e2210"/></radialGradient>` +
        `<linearGradient id="lg-q-ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d6"/><stop offset="1" stop-color="#d9bf8c"/></linearGradient>` +
        // Pixel FM
        `<linearGradient id="lg-x-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d7bff"/><stop offset="1" stop-color="#0d2470"/></linearGradient>` +
        `<pattern id="lg-x-grid" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none" stroke="#ffffff" stroke-opacity=".07" stroke-width="1"/></pattern>` +
        // The Bog Signal
        `<radialGradient id="lg-b-face" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#4f8a3c"/><stop offset=".55" stop-color="#1f4a24"/><stop offset="1" stop-color="#08180c"/></radialGradient>` +
        `<linearGradient id="lg-b-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5a3a"/><stop offset="1" stop-color="#0c2014"/></linearGradient>` +
        // Off
        `<radialGradient id="lg-o-face" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#4a3f58"/><stop offset="1" stop-color="#16111e"/></radialGradient>`;

    // A 5x7 pixel alphabet for Pixel FM.
    const PIX = { P: ["1110", "1001", "1001", "1110", "1000", "1000", "1000"], I: ["111", "010", "010", "010", "010", "010", "111"], X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
        E: ["1111", "1000", "1000", "1110", "1000", "1000", "1111"], L: ["1000", "1000", "1000", "1000", "1000", "1000", "1111"], F: ["1111", "1000", "1000", "1110", "1000", "1000", "1000"], M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"] };
    function pixelWord(word, x, y, px, fill, shade) {
        let out = "", cx = x;
        const w = [...word].reduce((a, c) => a + PIX[c][0].length + 1, -1) * px;
        cx = x - w / 2;
        for (const c of word) {
            const g = PIX[c];
            g.forEach((row, ry) => [...row].forEach((b, rx) => {
                if (b !== "1") return;
                out += `<rect x="${(cx + rx * px + 1).toFixed(1)}" y="${(y + ry * px + 1).toFixed(1)}" width="${px}" height="${px}" fill="${shade}"/>`;
                out += `<rect x="${(cx + rx * px).toFixed(1)}" y="${(y + ry * px).toFixed(1)}" width="${px}" height="${px}" fill="${fill}"/>`;
            }));
            cx += (g[0].length + 1) * px;
        }
        return out;
    }
    const arcText = (txt, which, size, fill, spacing) => `<text font-size="${size}" font-weight="800" fill="${fill}" stroke="#000" stroke-opacity=".55" stroke-width="1.4" paint-order="stroke" letter-spacing="${spacing || 1.5}" font-family="Montserrat,sans-serif"><textPath href="#lg-${which}" startOffset="50%" text-anchor="middle">${txt}</textPath></text>`;
    const bezel = (face, scene) =>
        `<circle r="54" fill="url(#lg-chrome)"/><circle r="54" fill="none" stroke="#0c0614" stroke-width="1.2"/><circle r="49" fill="#0c0614"/>` +
        `<g clip-path="url(#lg-face)"><circle r="47" fill="${face}"/>${scene}<circle r="47" fill="url(#lg-vign)"/></g>` +
        `<circle r="46.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.5"/>` +
        `<path d="M-41 -12 A43 43 0 0 1 41 -12 C22 -22 -22 -22 -41 -12Z" fill="url(#lg-gloss)"/>`;
    function logoSvg(i) {
        switch (i) {
            case -1: return bezel("url(#lg-o-face)",
                `<path d="M-14 -11 A19 19 0 1 0 14 -11" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="7" stroke-linecap="round" transform="translate(0 1.5)"/>` +
                `<line x1="0" y1="-23" x2="0" y2="-1" stroke="#000" stroke-opacity=".6" stroke-width="7" stroke-linecap="round" transform="translate(0 1.5)"/>` +
                `<path d="M-14 -11 A19 19 0 1 0 14 -11" fill="none" stroke="#d9d2e3" stroke-width="6" stroke-linecap="round"/><line x1="0" y1="-23" x2="0" y2="-1" stroke="#d9d2e3" stroke-width="6" stroke-linecap="round"/>`) +
                arcText("RADIO OFF", "bot", 7.5, "#d9d2e3", 2.5);
            case 0: { // NEON 108: a synth sun sinking behind a neon-tube sign, a grid running to the horizon
                let grid = "";
                for (let k = 0; k < 6; k++) { const y = 16 + k * k * 1.6 + k * 2; grid += `<line x1="-50" y1="${y.toFixed(1)}" x2="50" y2="${y.toFixed(1)}" stroke="#ff3fa4" stroke-opacity="${(0.25 + k * 0.1).toFixed(2)}" stroke-width=".9"/>`; }
                for (let k = -6; k <= 6; k++) grid += `<line x1="${k * 3}" y1="15" x2="${k * 16}" y2="50" stroke="#ff3fa4" stroke-opacity=".45" stroke-width=".8"/>`;
                let sun = `<circle cx="0" cy="8" r="22" fill="url(#lg-n-sun)"/>`;
                for (let k = 0; k < 5; k++) sun += `<rect x="-24" y="${(4 + k * 3.6).toFixed(1)}" width="48" height="${(0.6 + k * 0.45).toFixed(2)}" fill="#14062a"/>`;
                return bezel("url(#lg-n-face)", sun + `<rect x="-50" y="15" width="100" height="40" fill="#0b0318"/>` + grid +
                    `<text text-anchor="middle" y="-6" font-size="25" font-weight="900" font-style="italic" font-family="Montserrat,sans-serif" textLength="74" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#ff3fa4" stroke-width="3.2" filter="url(#lg-neon)">NEON</text>` +
                    `<text text-anchor="middle" y="-6" font-size="25" font-weight="900" font-style="italic" font-family="Montserrat,sans-serif" textLength="74" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#fff" stroke-width="1.1">NEON</text>` +
                    `<text text-anchor="middle" y="15" font-size="17" font-weight="900" font-family="Montserrat,sans-serif" textLength="40" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#2ee6ff" stroke-width="2.6" filter="url(#lg-neon)">108</text>` +
                    `<text text-anchor="middle" y="15" font-size="17" font-weight="900" font-family="Montserrat,sans-serif" textLength="40" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#e8fdff" stroke-width=".9">108</text>`) +
                    arcText("THE NIGHT DRIVE", "bot", 6.5, "#ffc4e4", 2);
            }
            case 1: { // QUARRY FOLK: a barrel-head of turned wood, iron rivets, a ribbon, crossed picks
                let grain = "";
                for (let k = 0; k < 7; k++) grain += `<ellipse cx="${(-3 + k).toFixed(1)}" cy="${(2 - k * 0.6).toFixed(1)}" rx="${8 + k * 6}" ry="${6 + k * 5.2}" fill="none" stroke="#3e2210" stroke-opacity="${(0.18 + k * 0.03).toFixed(2)}" stroke-width="${(0.8 + (k % 2) * 0.6).toFixed(1)}"/>`;
                let rivets = "";
                for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; rivets += `<circle cx="${(Math.cos(a) * 42).toFixed(1)}" cy="${(Math.sin(a) * 42).toFixed(1)}" r="1.9" fill="#3a3540"/><circle cx="${(Math.cos(a) * 42 - 0.5).toFixed(1)}" cy="${(Math.sin(a) * 42 - 0.6).toFixed(1)}" r=".9" fill="#d8d2e0"/>`; }
                const pick = (rot) => `<g transform="rotate(${rot}) translate(0 -8)"><rect x="-1.4" y="-6" width="2.8" height="30" rx="1" fill="#6b4222" stroke="#2a1608" stroke-width=".6"/><path d="M-13 -6 Q0 -13 13 -6 L13 -4 Q0 -9 -13 -4Z" fill="#c7c2cc" stroke="#2a1608" stroke-width=".7"/></g>`;
                return bezel("url(#lg-q-wood)", grain + rivets + `<g opacity=".9" transform="translate(0 -14) scale(.62)">${pick(-38)}${pick(38)}</g>` +
                    `<path d="M-44 0 L-36 -6 L-36 8 Z M44 0 L36 -6 L36 8 Z" fill="#b89a62"/>` +
                    `<path d="M-38 -7 Q0 -11 38 -7 L38 9 Q0 5 -38 9 Z" fill="url(#lg-q-ribbon)" stroke="#5a3a18" stroke-width=".8"/>` +
                    `<text text-anchor="middle" y="5.5" font-size="11.5" font-weight="900" font-family="Georgia,serif" letter-spacing="2.2" fill="#4a2a10" textLength="62" lengthAdjust="spacing">QUARRY</text>` +
                    `<text text-anchor="middle" y="31" font-size="21" font-weight="900" font-style="italic" font-family="Georgia,serif" fill="#fff3dd" stroke="#2a1608" stroke-width="3" paint-order="stroke" textLength="44" lengthAdjust="spacingAndGlyphs">Folk</text>`) +
                    arcText("ACOUSTIC · FOLK-POP", "top", 6, "#fff3dd", 1.4);
            }
            case 2: { // PIXEL FM: a pixel-art dial, falling blocks, a pixel word
                const blocks = [[-30, -34, "#ffd166"], [-18, -40, "#ff5fa2"], [-6, -36, "#7dff9a"], [6, -42, "#ff7a3d"], [18, -35, "#2ee6ff"], [28, -29, "#ffd166"]]
                    .map(([x, y, c]) => `<rect x="${x}" y="${y}" width="9" height="9" fill="${c}"/><rect x="${x}" y="${y}" width="9" height="2" fill="#fff" fill-opacity=".55"/><rect x="${x}" y="${y + 7}" width="9" height="2" fill="#000" fill-opacity=".3"/>`).join("");
                return bezel("url(#lg-x-face)", `<rect x="-50" y="-50" width="100" height="100" fill="url(#lg-x-grid)"/>` + blocks +
                    pixelWord("PIXEL", 0, -12, 2.6, "#ffffff", "#0a1640") +
                    `<rect x="-17" y="10" width="34" height="20" rx="2" fill="#ffd166" stroke="#0a1640" stroke-width="1.6"/><rect x="-15" y="12" width="30" height="3" fill="#fff" fill-opacity=".6"/>` +
                    pixelWord("FM", 0, 13, 2, "#0a1640", "#c99a2a")) +
                    arcText("CHIP-POP · 8-BIT", "bot", 6.5, "#d6e4ff", 2);
            }
            case 3: { // PINK PALMS: sunset over the sea, palms, a script name
                let sun = `<circle cx="4" cy="6" r="21" fill="#ffe08a"/>`;
                for (let k = 0; k < 4; k++) sun += `<rect x="-20" y="${(8 + k * 3.4).toFixed(1)}" width="50" height="${(0.8 + k * 0.5).toFixed(2)}" fill="#ff7a5a"/>`;
                let sea = `<rect x="-50" y="18" width="100" height="32" fill="url(#lg-p-sea)"/>`;
                for (let k = 0; k < 5; k++) sea += `<rect x="${(-8 + k * 2 - (k % 2) * 6).toFixed(1)}" y="${(21 + k * 3.2).toFixed(1)}" width="${(22 - k * 3).toFixed(1)}" height="1.2" fill="#ffcf6e" fill-opacity="${(0.8 - k * 0.12).toFixed(2)}"/>`;
                const palm = (x, s, flip) => `<g transform="translate(${x} 20) scale(${flip ? -s : s} ${s})"><path d="M0 0 C1 -10 2 -22 6 -32" fill="none" stroke="#1d0630" stroke-width="2.6"/>` +
                    `<path d="M6 -32 C-2 -36 -10 -33 -15 -26 C-8 -30 -1 -31 6 -31 C2 -38 -2 -42 -10 -44 C-2 -42 4 -38 7 -32 C10 -40 16 -42 22 -40 C15 -38 11 -36 8 -31 C15 -34 22 -30 25 -24 C18 -29 12 -30 7 -30Z" fill="#1d0630"/></g>`;
                return bezel("url(#lg-p-sky)", sun + sea + palm(-30, 0.85, false) + palm(31, 0.72, true) +
                    `<text text-anchor="middle" y="-11" font-size="20" font-weight="700" font-style="italic" font-family="Georgia,serif" fill="#fff" stroke="#c0186e" stroke-width="3.4" paint-order="stroke" textLength="52" lengthAdjust="spacingAndGlyphs" filter="url(#lg-drop)">Pink</text>` +
                    `<text text-anchor="middle" y="8" font-size="20" font-weight="700" font-style="italic" font-family="Georgia,serif" fill="#fff" stroke="#c0186e" stroke-width="3.4" paint-order="stroke" textLength="64" lengthAdjust="spacingAndGlyphs" filter="url(#lg-drop)">Palms</text>`) +
                    arcText("SUNNY SYNTH-POP", "bot", 6.5, "#fff0f6", 2);
            }
            case 4: { // THE BOG SIGNAL: a lattice mast over the bog, signal rings, a frog surfacing
                let mast = `<path d="M0 -36 L-9 14 M0 -36 L9 14" stroke="#1a1f16" stroke-width="2.4"/>`;
                for (let k = 0; k < 6; k++) { const y = -28 + k * 7.5, w = 1.6 + k * 1.5; mast += `<path d="M${-w} ${y} L${w + 1.5} ${y + 7.5} M${w} ${y} L${-w - 1.5} ${y + 7.5}" stroke="#2a3324" stroke-width="1"/>`; }
                mast += `<circle cx="0" cy="-37" r="2.6" fill="#ff3b3b"/><circle cx="0" cy="-37" r="5" fill="#ff3b3b" fill-opacity=".3"/>`;
                const rings = [10, 17, 24].map((r, k) => `<path d="M${-r} ${-37 - r * 0.15} A${r} ${r} 0 0 1 ${-r * 0.35} ${-37 - r * 0.9}" fill="none" stroke="#b6ff7a" stroke-opacity="${(0.9 - k * 0.22).toFixed(2)}" stroke-width="1.8" stroke-linecap="round"/>` +
                    `<path d="M${r} ${-37 - r * 0.15} A${r} ${r} 0 0 0 ${r * 0.35} ${-37 - r * 0.9}" fill="none" stroke="#b6ff7a" stroke-opacity="${(0.9 - k * 0.22).toFixed(2)}" stroke-width="1.8" stroke-linecap="round"/>`).join("");
                let water = `<rect x="-50" y="12" width="100" height="40" fill="url(#lg-b-water)"/>`;
                for (let k = 0; k < 4; k++) water += `<ellipse cx="${(-14 + k * 9).toFixed(1)}" cy="${(17 + k * 4).toFixed(1)}" rx="${10 + k * 3}" ry="1.2" fill="none" stroke="#7bd36a" stroke-opacity=".35" stroke-width=".8"/>`;
                const frog = `<g transform="translate(20 14)"><ellipse cx="0" cy="2" rx="11" ry="4" fill="#3f8f3a"/><circle cx="-5" cy="-1" r="4.2" fill="#6fcf58" stroke="#1d4a1c" stroke-width=".8"/><circle cx="5" cy="-1" r="4.2" fill="#6fcf58" stroke="#1d4a1c" stroke-width=".8"/>` +
                    `<circle cx="-4.4" cy="-1.3" r="2" fill="#0b1a0c"/><circle cx="5.6" cy="-1.3" r="2" fill="#0b1a0c"/><circle cx="-3.8" cy="-2" r=".7" fill="#fff"/><circle cx="6.2" cy="-2" r=".7" fill="#fff"/></g>`;
                const reeds = `<path d="M-34 14 Q-35 2 -31 -8 M-30 14 Q-29 4 -33 -4 M-26 14 Q-25 6 -22 -2" stroke="#16351a" stroke-width="1.6" fill="none"/><ellipse cx="-31" cy="-9" rx="1.6" ry="4" fill="#4a2c16"/>`;
                return bezel("url(#lg-b-face)", rings + mast + water + reeds + frog +
                    `<text text-anchor="middle" y="33" font-size="13" font-weight="900" font-family="Montserrat,sans-serif" letter-spacing="1" fill="#d9ffb8" stroke="#08180c" stroke-width="2.6" paint-order="stroke" textLength="60" lengthAdjust="spacingAndGlyphs">SIGNAL</text>`) +
                    arcText("THE BOG", "top", 8.5, "#d9ffb8", 3);
            }
        }
        return "";
    }

    function create(opts) {
        opts = opts || {};
        let station = -1, order = [], pos = 0, playing = false, held = false, trackTimer = 0, kind = null, nowTrack = "", alive = true;
        let wheelEl = null, nameEl = null, nameTimer = 0;
        const changed = () => { if (alive && opts.onChange) opts.onChange(); };

        function silence(except) {
            if (except !== "ff" && window.FFAudio) { try { FFAudio.stop(0.4); } catch (e) { /* fine */ } }
            if (except !== "rat" && window.RatMusic) { try { RatMusic.stop(); RatMusic.rest(); } catch (e) { /* fine */ } }
            if (except !== "tune" && window.GtaTunes) { try { GtaTunes.stop(0.4); } catch (e) { /* fine */ } }
        }
        function playTrack() {
            clearTimeout(trackTimer);
            if (station < 0) return;
            const [k, id, name] = STATIONS[station].tracks[order[pos % order.length]];
            nowTrack = name;
            const want = station;
            engine(k).then((E) => {
                if (!alive || station !== want || !playing) return;
                if (!E) { nowTrack = "No signal"; changed(); return; }
                silence(k);
                kind = k;
                if (k === "ff") {
                    keepSetting("mazerats_ff_music", () => { if (!E.music) E.setMusic(true); });
                    E.start({ track: id });
                } else if (k === "tune") {
                    // Twice round the song, seamlessly, then the station's next one (at the end of the song, not on a clock).
                    clearTimeout(trackTimer);
                    E.play(id, { loops: 2, onEnd: () => { if (alive && station === want && playing) { pos++; playTrack(); changed(); } } });
                } else {
                    keepSetting("mazerats_ratrace_music", () => { if (E.muted) E.setMuted(false); });
                    E.start(1, { zone: id });
                }
                if (held || document.hidden) pauseEngine();
                changed();
            });
            if (k !== "tune") trackTimer = setTimeout(() => { pos++; playTrack(); changed(); }, TRACK_MS);
        }
        function pauseEngine() { try { const E = kind && engineOf(kind); if (E) E.pause(); } catch (e) { /* fine */ } }
        function resumeEngine() { try { const E = kind && engineOf(kind); if (E) E.resume(); } catch (e) { /* fine */ } }

        function tune(i, quiet) {
            if (i < 0 || i >= STATIONS.length) { off(); return; }
            station = i;
            order = STATIONS[i].tracks.map((_, k) => k);
            for (let k = order.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [order[k], order[r]] = [order[r], order[k]]; }
            pos = 0; playing = true;
            write(SAVE, JSON.stringify({ station: STATIONS[i].id, on: true }));
            playTrack();
            if (!quiet) showName();
            changed();
        }
        // quiet: no name across the screen (a change from the phone's Radio app, scan 18 Nov evening).
        function off(quiet) {
            clearTimeout(trackTimer);
            if (station >= 0) write(SAVE, JSON.stringify({ station: STATIONS[station].id, on: false }));
            station = -1; playing = false; kind = null; nowTrack = "";
            silence();
            if (!quiet) showName();
            changed();
        }
        function step(dir, showWheel, quiet) {
            const n = STATIONS.length + 1;                     // the stations and OFF
            const at = (station < 0 ? STATIONS.length : station);
            const to = (at + dir + n) % n;
            if (to === STATIONS.length) off(quiet); else tune(to, quiet);
            if (showWheel && wheelEl) drawWheel(to === STATIONS.length ? -1 : to);
        }
        function resumeSaved(force, quiet) {
            let s = null;
            try { s = JSON.parse(read(SAVE) || "null"); } catch (e) { s = null; }
            if (!s || (!s.on && !force)) { if (force) tune(0, quiet); return; }
            const i = STATIONS.findIndex((x) => x.id === s.station);
            if (i >= 0 && station !== i) tune(i, true);
        }

        // ---- the station's name across the top, as when the car's radio is changed
        function showName() {
            if (!nameEl) { nameEl = document.createElement("div"); nameEl.className = "gx-radio-name"; nameEl.setAttribute("aria-live", "polite"); document.body.appendChild(nameEl); }
            const st = station >= 0 ? STATIONS[station] : null;
            nameEl.innerHTML = `<b>${esc(st ? st.name : "Radio off")}</b>${st ? `<span>${esc(st.genre)}</span>` : ""}`;
            nameEl.classList.remove("is-on"); void nameEl.offsetWidth; nameEl.classList.add("is-on");
            clearTimeout(nameTimer); nameTimer = setTimeout(() => nameEl && nameEl.classList.remove("is-on"), 2200);
        }

        // ---- the wheel
        const NS = "http://www.w3.org/2000/svg";
        let lit = 0, anchor = null;
        const SLOTS = () => STATIONS.length + 1;               // OFF at the top, the stations round from it
        const slotStation = (s) => (s === 0 ? -1 : s - 1);
        const logo = logoSvg;
        function drawWheel(selStation) {
            const n = SLOTS(), CX = 0, CY = 0, RO = 300, RI = 132, RM = 216, gap = 0.035;
            lit = selStation == null ? lit : selStation + 1;
            const arc = (a0, a1) => { const p = (a, r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r], [x0, y0] = p(a0, RO), [x1, y1] = p(a1, RO), [x2, y2] = p(a1, RI), [x3, y3] = p(a0, RI);
                return `M${x0} ${y0}A${RO} ${RO} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${RI} ${RI} 0 0 0 ${x3} ${y3}Z`; };
            let wedges = "", logos = "";
            for (let s = 0; s < n; s++) {
                const a = -Math.PI / 2 + (s - 0.5) * 2 * Math.PI / n, mid = -Math.PI / 2 + s * 2 * Math.PI / n, on = s === lit, tuned = slotStation(s) === station;
                wedges += `<path class="gx-wh-wedge${on ? " is-lit" : ""}" data-slot="${s}" d="${arc(a + gap, a + 2 * Math.PI / n - gap)}" fill="${on ? "url(#gr-sel)" : "url(#gr-ring)"}" stroke="${on ? "#ff5fa2" : tuned ? "#ffd166" : "#3a1d55"}" stroke-width="${on ? 3 : tuned ? 2.5 : 1.5}"/>`;
                logos += `<g transform="translate(${(Math.cos(mid) * RM).toFixed(1)} ${(Math.sin(mid) * RM).toFixed(1)}) scale(${on ? 1.12 : 1})" pointer-events="none">${logo(slotStation(s))}</g>`;
            }
            const st = slotStation(lit) >= 0 ? STATIONS[slotStation(lit)] : null;
            /* THE MIDDLE (the owner's, 19 Nov 2026: "unclean and messy ... not
               capitalized ... cut off"). Every line in capitals, in one face;
               the name sized to fit the dial rather than squeezed into it; the
               long lines shortened with an ellipsis, never run past the rim. */
            const tunedHere = slotStation(lit) === station && station >= 0;
            const fit = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);
            const name = st ? st.name.toUpperCase() : "RADIO OFF";
            const nameSize = Math.max(17, Math.min(30, Math.floor(208 / (name.length * 0.66))));
            const label = st ? (tunedHere ? "NOW PLAYING" : "TUNE IN TO") : (station >= 0 ? "SWITCH OFF" : "THE RADIO IS");
            const line2 = st ? st.genre.toUpperCase() : "PICK A STATION";
            const line3 = st ? (tunedHere && nowTrack ? "♪  " + nowTrack.toUpperCase() : st.tracks.length + " SONGS · ON A LOOP") : "";
            const mid =
                `<radialGradient id="gr-mid" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#2a1240"/><stop offset="1" stop-color="#0b0514"/></radialGradient>` +
                `<circle r="${RI - 4}" fill="#0b0514"/><circle r="${RI - 8}" fill="url(#gr-mid)" stroke="#ff5fa2" stroke-opacity=".55" stroke-width="1.5"/>` +
                `<circle r="${RI - 15}" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="1"/>` +
                `<g font-family="Montserrat,sans-serif" text-anchor="middle">` +
                `<text y="-40" font-size="10.5" font-weight="800" letter-spacing="3.5" fill="#ff9ccc">${label}</text>` +
                `<text y="${-4 + nameSize * 0.18}" font-size="${nameSize}" font-weight="900" font-style="italic" fill="#fff" stroke="#c0186e" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${esc(name)}</text>` +
                `<line x1="-58" y1="18" x2="58" y2="18" stroke="#ff5fa2" stroke-opacity=".5" stroke-width="1"/>` +
                `<text y="37" font-size="10.5" font-weight="700" letter-spacing="2" fill="#ffd9ea">${esc(fit(line2, 24))}</text>` +
                (line3 ? `<text y="58" font-size="10" font-weight="700" letter-spacing="1.5" fill="#7dff9a">${esc(fit(line3, 26))}</text>` : "") +
                `</g>`;
            wheelEl.querySelector(".gx-wh-svg").innerHTML =
                `<defs><radialGradient id="gr-ring" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="300"><stop offset="40%" stop-color="#0d0618" stop-opacity=".96"/><stop offset="100%" stop-color="#2a1240" stop-opacity=".96"/></radialGradient>` +
                `<radialGradient id="gr-sel" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="300"><stop offset="40%" stop-color="#ff5fa2" stop-opacity=".15"/><stop offset="100%" stop-color="#ff5fa2" stop-opacity=".55"/></radialGradient>` +
                `<linearGradient id="gr-neon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a0630"/><stop offset="1" stop-color="#05020c"/></linearGradient>` +
                `<linearGradient id="gr-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5230"/><stop offset="1" stop-color="#3a2414"/></linearGradient>` +
                `<linearGradient id="gr-ff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b6bff"/><stop offset="1" stop-color="#12307a"/></linearGradient>` +
                `<linearGradient id="gr-palm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a1a72"/><stop offset=".55" stop-color="#ff5fa2"/><stop offset="1" stop-color="#ffd166"/></linearGradient>` +
                `<radialGradient id="gr-bog" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#3d7a3a"/><stop offset="1" stop-color="#0f2a17"/></radialGradient>` +
                `<filter id="gr-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` + LOGO_DEFS + `</defs>` +
                `<circle r="${RO + 10}" fill="rgba(8,3,16,.55)" stroke="#ff5fa2" stroke-width="2" opacity=".9"/><circle r="${RO + 16}" fill="none" stroke="#ff5fa2" stroke-width="1" opacity=".35"/>` +
                wedges + logos + mid;
            wheelEl.setAttribute("aria-label", `Radio stations. ${st ? st.name : "Off"} selected. Arrow keys to choose, Enter to tune, Escape to close.`);
        }
        function wheel(from) {
            if (wheelEl) { closeWheel(); return; }
            anchor = from || null;
            wheelEl = document.createElement("div");
            wheelEl.className = "gx-wheel";
            wheelEl.setAttribute("role", "dialog");
            wheelEl.tabIndex = -1;
            wheelEl.innerHTML = `<svg class="gx-wh-svg" viewBox="-330 -330 660 660" xmlns="${NS}"></svg>`;
            document.body.appendChild(wheelEl);
            // Off, it opens on the station last played, ready to tune in again.
            let last = -1;
            if (station < 0) { try { const s = JSON.parse(read(SAVE) || "null"); last = s ? STATIONS.findIndex((x) => x.id === s.station) : -1; } catch (e) { last = -1; } }
            drawWheel(station >= 0 ? station : last);
            requestAnimationFrame(() => { if (wheelEl) { wheelEl.classList.add("is-on"); wheelEl.focus({ preventScroll: true }); } });
            wheelEl.addEventListener("pointermove", onHover);
            wheelEl.addEventListener("click", onPick);
            document.addEventListener("keydown", onWheelKey, true);
        }
        function closeWheel() {
            if (!wheelEl) return;
            document.removeEventListener("keydown", onWheelKey, true);
            const w = wheelEl; wheelEl = null;
            w.classList.remove("is-on");
            setTimeout(() => w.remove(), opts.reduced && opts.reduced() ? 0 : 180);
            if (anchor && document.contains(anchor)) anchor.focus({ preventScroll: true });
        }
        function onHover(e) {
            const p = e.target.closest && e.target.closest("[data-slot]");
            if (p && Number(p.dataset.slot) !== lit) drawWheel(slotStation(Number(p.dataset.slot)));
        }
        function onPick(e) {
            const p = e.target.closest && e.target.closest("[data-slot]");
            if (!p) { if (e.target === wheelEl) closeWheel(); return; }      // the dimmed page round it
            const s = slotStation(Number(p.dataset.slot));
            if (s < 0) off(); else tune(s);
            closeWheel();
        }
        function onWheelKey(e) {
            if (!wheelEl) return;
            const n = SLOTS();
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeWheel(); }
            else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); drawWheel(slotStation((lit + 1) % n)); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); drawWheel(slotStation((lit - 1 + n) % n)); }
            else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); const s = slotStation(lit); if (s < 0) off(); else tune(s); closeWheel(); }
            else if (e.key === "Tab") { e.preventDefault(); wheelEl.focus({ preventScroll: true }); }
        }

        // ---- quiet behind a game, in the Hallway (the owner's, 18 Nov 2026: its own music plays there), and while the tab is hidden
        const root = document.documentElement;
        const front = () => { const was = held; held = !!root.dataset.gameFront || root.classList.contains("hallway-open"); if (held !== was && playing) { if (held) pauseEngine(); else if (!document.hidden) resumeEngine(); } };
        const mo = new MutationObserver(front);
        mo.observe(root, { attributes: true, attributeFilter: ["data-game-front", "class"] });
        const vis = () => { if (!playing) return; if (document.hidden) pauseEngine(); else if (!held) resumeEngine(); };
        document.addEventListener("visibilitychange", vis);
        front();

        return {
            tune, off, step, wheel, resumeSaved, closeWheel,
            get wheelEl() { return wheelEl; },
            current: () => (station >= 0 ? STATIONS[station] : null),
            track: () => nowTrack,
            playing: () => playing && station >= 0,
            destroy() {
                alive = false;
                clearTimeout(trackTimer); clearTimeout(nameTimer);
                closeWheel();
                if (nameEl) nameEl.remove(); nameEl = null;
                mo.disconnect();
                document.removeEventListener("visibilitychange", vis);
                silence();
            }
        };
    }

    window.GtaRadio = { STATIONS, create, LOGO: { defs: LOGO_DEFS, svg: logoSvg } };
})();

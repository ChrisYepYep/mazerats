/* Finds FurniIndex furni inside a Habbo room screenshot.

   Habbo composites furni into a room as unmodified pixels — proven on real
   screenshots: 42% of textured 20x20 patches in one room appear more than
   once in that same room, one of them 45 times, because the same furni is
   placed repeatedly and renders byte-for-byte identically each time. So
   this is exact-colour template matching, not fuzzy image recognition, and
   a hit is certain rather than probable.

   Testing every sprite at every position would be hopeless. Instead each
   sprite picks the few pixels whose colours are RAREST IN THIS PARTICULAR
   ROOM, and the room's colour index turns those into a handful of positions
   worth checking. Several probes are used because any one of them may be
   the part of the furni that something else is standing in front of.

   Two limits worth knowing, both found by testing:

   - Rooms with lighting effects can't be matched. A clean screenshot holds
     ~150-1100 distinct colours; one with torches and glows held 31,919,
     because the effect shifts every pixel. isScannable() rejects those
     rather than returning nonsense.
   - Only furni in FurniIndex's catalogue can be found, and it is not
     complete (Pura Lamp, plainly present in these rooms, is absent). That
     is accepted: every furni listed has to link to their page anyway.
*/

const { decodePng } = require("./_png.js");

// Absolute count of exactly-matching pixels before a hit is worth reporting.
// Coverage is a poor test on its own: a maze room stacks furni so densely
// that a real hit often shows only 10-35% of its sprite.
const MIN_MATCHED = 150;
// Distinct colours those matching pixels must span. Without this, any large
// dark sprite "matches" thousands of pixels of the flat black surround
// around a screenshot — that one check took a test scan from 424 bogus
// candidates down to 16 real ones.
const MIN_COLOURS = 8;
const PROBES = 6;
const MAX_POSITIONS = 900;
// Above this many distinct colours, a screenshot has lighting effects on it
// and nothing will match exactly.
const MAX_ROOM_COLOURS = 4000;

function buildColourIndex(img) {
    const { width, height, data } = img;
    const index = new Map();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
            let a = index.get(key);
            if (!a) index.set(key, a = []);
            a.push(y * width + x);
        }
    }
    return index;
}

/* Whether exact matching stands any chance on this screenshot. A room with
   a dimmer or glowing furni in it has had every pixel shifted, so nothing
   will ever match — better to say so than to return an empty result that
   looks like "no furni found". */
function isScannable(room) {
    const colours = new Set();
    const d = room.data;
    for (let i = 0; i < d.length; i += 4) {
        colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        if (colours.size > MAX_ROOM_COLOURS) return { ok: false, colours: colours.size };
    }
    return { ok: true, colours: colours.size };
}

/* sprites: [{ key, buffer }] where key identifies the furni it belongs to.
   Returns the best hit per key, strongest first. */
function scanRoom(roomBuffer, sprites) {
    const room = decodePng(roomBuffer);
    const scannable = isScannable(room);
    if (!scannable.ok) {
        return { skipped: "lighting-effects", roomColours: scannable.colours, hits: [] };
    }

    const RW = room.width, RH = room.height, RD = room.data;
    const index = buildColourIndex(room);
    const best = new Map();

    for (const sprite of sprites) {
        let sp;
        try { sp = decodePng(sprite.buffer); } catch { continue; }
        const SW = sp.width, SH = sp.height, SD = sp.data;
        if (SW > RW || SH > RH) continue;

        const solid = [];
        for (let y = 0; y < SH; y++) {
            for (let x = 0; x < SW; x++) {
                const o = (y * SW + x) * 4;
                if (SD[o + 3] > 250) solid.push([x, y, SD[o], SD[o + 1], SD[o + 2]]);
            }
        }
        if (solid.length < MIN_MATCHED) continue;

        // One representative pixel per colour, ordered by how rare that
        // colour is in this room — the rarest gives the fewest positions to
        // test, so it is tried first.
        const perColour = new Map();
        for (const p of solid) {
            const k = (p[2] << 16) | (p[3] << 8) | p[4];
            if (!perColour.has(k)) perColour.set(k, p);
        }
        const probes = [...perColour.values()]
            .map(p => ({ p, hits: index.get((p[2] << 16) | (p[3] << 8) | p[4]) }))
            .filter(o => o.hits)
            .sort((a, b) => a.hits.length - b.hits.length)
            .slice(0, PROBES);
        if (!probes.length) continue;

        const seen = new Set();
        let tested = 0, bestMatched = 0, bestAt = null, bestColours = 0;
        for (const { p, hits } of probes) {
            if (tested >= MAX_POSITIONS) break;
            for (const packed of hits) {
                if (tested >= MAX_POSITIONS) break;
                const hx = packed % RW, hy = (packed / RW) | 0;
                const ox = hx - p[0], oy = hy - p[1];
                if (ox < 0 || oy < 0 || ox + SW > RW || oy + SH > RH) continue;
                const at = oy * RW + ox;
                if (seen.has(at)) continue;
                seen.add(at);
                tested++;

                let ok = 0;
                const cols = new Set();
                for (let i = 0; i < solid.length; i++) {
                    const s = solid[i];
                    const ro = ((oy + s[1]) * RW + ox + s[0]) * 4;
                    if (RD[ro] === s[2] && RD[ro + 1] === s[3] && RD[ro + 2] === s[4]) {
                        ok++;
                        cols.add((s[2] << 16) | (s[3] << 8) | s[4]);
                    }
                }
                if (cols.size < MIN_COLOURS) continue;
                if (ok > bestMatched) {
                    bestMatched = ok; bestAt = [ox, oy]; bestColours = cols.size;
                }
            }
        }

        if (bestMatched < MIN_MATCHED) continue;
        const prev = best.get(sprite.key);
        if (!prev || bestMatched > prev.matched) {
            best.set(sprite.key, {
                key: sprite.key,
                matched: bestMatched,
                total: solid.length,
                colours: bestColours,
                at: bestAt,
                coverage: bestMatched / solid.length
            });
        }
    }

    return {
        roomColours: scannable.colours,
        hits: dedupeByPosition([...best.values()].sort((a, b) => b.matched - a.matched))
    };
}

/* Recolour variants of one object all land on the same spot — four Gothic
   fountain colourways at [314,231], a Double Bed and a Single Bed one pixel
   apart. Keeping every one of them would list the same physical furni four
   times, so the strongest wins the position and the others are carried as
   alternates for whoever reviews the scan. */
function dedupeByPosition(hits, radius = 6) {
    const kept = [];
    for (const hit of hits) {
        const near = kept.find(k =>
            Math.abs(k.at[0] - hit.at[0]) <= radius && Math.abs(k.at[1] - hit.at[1]) <= radius);
        if (near) {
            (near.alternates = near.alternates || []).push(hit.key);
        } else {
            kept.push(hit);
        }
    }
    return kept;
}

module.exports = { scanRoom, isScannable, MIN_MATCHED, MIN_COLOURS };

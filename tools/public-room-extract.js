/* Pull a PUBLIC room out of the Origins client — the Library to begin with —
   and write it as js/room-public.js plus its artwork under assets/rooms/.

   ----------------------------------------------------------------------
   A PUBLIC ROOM IS NOT BUILT THE WAY A PRIVATE ONE IS, and that is the whole
   reason this is a separate tool.

   A private room (tools/room-layouts-extract.js) is ASSEMBLED: the client
   stamps floor pieces and wall panels across a grid, and the model file lists
   every one of them, which is how the tile grid can be recovered from it.

   A public room is PAINTED. hh_room_library.cct holds one bitmap —
   `library_backround`, 717x486, tagged `#id: "floor"` — that is the entire
   room, drawn by hand. Everything else in the file is an overlay: lamps, a
   chandelier, shelf and statue MASKS that are drawn over an avatar to put it
   behind the scenery, each with an explicit `#locZ` to sort by. There are no
   floor pieces to count and no wall panels to follow.

   ----------------------------------------------------------------------
   HALF SCALE, which is the point of starting here.

   library.room's <roomdata> reads

       [#offsetx: 290, #offsety: 1, #factorx: 32, #factory: 16, #factorh: 16]

   — 32x16 tiles against a private room's 64x32. The client drew the big rooms
   at half scale because they do not fit the stage otherwise, and it ships a
   whole second set of art for them (hh_furni_small.cct, hh_people_small_1).
   So the Library is already the scale we want, and it arrives as one picture
   rather than as a grid to rebuild.

   THE BACKGROUND'S PLACEMENT matters for the grid. Its element gives
   `#locH: 358, #locV: 264` against a registration point of (358, 243), so its
   top-left sits at stage (0, 21). The roomdata origin is in the same stage
   coordinates, so relative to the IMAGE the origin is (290, 1 - 21) =
   (290, -20) — twenty pixels above the picture's own top edge, which is
   simply where tile (0,0) would be if the gallery were not in the way.

   ----------------------------------------------------------------------
   THE WALKABLE GRID IS NOT IN THE CLIENT AT ALL.

   Habbo's server sent a room's heightmap at runtime; the client only ever had
   the artwork. There is no mask to read and nothing to decode, so it has to be
   DERIVED — and the floor art gives no help either: the stone is a uniform
   8x4 speckle with no tile boundaries in it, so no amount of looking at the
   pixels recovers the lattice. The lattice comes from <roomdata> and is
   trusted.

   What the art DOES tell you is which tiles are open floor. Each tile is
   sampled across its diamond and counted as walkable when it is nearly all
   bare floor — grey stone by its low saturation and middling brightness, plus
   the red carpet, which is floor that happens to be red. Shelves, the statue,
   the plant pots, the gallery above and the lower wooden level all fail it.
   The largest connected group is kept, so a stray patch of grey behind a
   bookcase does not become an island nobody can reach.

   That yields 98 tiles of open library floor, which is what this game can use.
   It is a FLAT reading of a room that is not flat: the Library has a gallery,
   a staircase and a sunken wooden floor, and this game has no floor heights at
   all, so only the main level is taken.

   THE THRESHOLDS ARE TUNED TO THIS ROOM'S PALETTE and are meant to be. A
   second public room will want its own; the point of the tool is that the
   geometry, the artwork and the shape of the output are already right, and
   only the classifier moves.

   usage: node tools/public-room-extract.js [hh_room_library.cct] */

const fs = require("fs");
const path = require("path");
const { openCast, readMember, listCast } = require("./cct-extract.js");
const { decodePng } = require("./png-decode.js");
const { encodePng } = require("./png-encode.js");

const DIR = "C:/Users/cjboy/AppData/Roaming/Habbo Launcher/downloads/shockwave/350";
const DEFAULT_CCT = path.join(DIR, "hh_room_library.cct");

/* One entry per public room this tool knows how to read. `floorLooksLike`
   is the per-room part: given a pixel, is this bare floor? */
const ROOMS = {
    library: {
        id: "library",
        name: "Library",
        field: "library.room",
        background: "library_backround",
        grid: 26,                       // how far out to scan for floor
        floorLooksLike(r, g, b) {
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const sat = mx === 0 ? 0 : (mx - mn) / mx;
            const stone = sat < 0.18 && mx > 55 && mx < 135;
            const carpet = r > 70 && r < 190 && r > g * 1.5 && r > b * 1.5;
            return stone || carpet;
        }
    }
};

function castOf(file) {
    const cast = openCast(file);
    const regs = new Map(listCast(file).map(m => [m.name, m]));
    const members = [];
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (m && m.name) members.push({ id: e.id, ...m });
    }
    const byName = new Map(members.map(m => [m.name, m]));
    const fieldText = (name) => {
        const m = byName.get(name);
        if (!m) return null;
        const sid = cast.childOf.get(`${m.id}:STXT`);
        if (sid === undefined) return null;
        const b = cast.chunk(cast.byId.get(sid));
        const off = b.readUInt32BE(0), len = b.readUInt32BE(4);
        return b.toString("latin1", off, off + len);
    };
    return { cast, regs, byName, fieldText };
}

function parseRoom(text) {
    const t = text.replace(/\r/g, "\n");
    const rd = /#offsetx: (-?\d+), #offsety: (-?\d+), #factorx: (\d+), #factory: (\d+)(?:, #factorh: (\d+))?/.exec(t);
    if (!rd) throw new Error("no <roomdata>");
    const els = [];
    for (const m of t.matchAll(/\[([^\]]*)\]/g)) {
        const body = m[1];
        const name = /#member: "([^"]+)"/.exec(body);
        if (!name) continue;
        const num = (re) => { const x = re.exec(body); return x ? +x[1] : null; };
        const str = (re) => { const x = re.exec(body); return x ? x[1] : null; };
        els.push({
            member: name[1],
            locH: num(/#locH: (-?\d+)/), locV: num(/#locV: (-?\d+)/),
            ink: num(/#ink: (-?\d+)/), blend: num(/#blend: (-?\d+)/),
            locZ: num(/#locZ: (-?\d+)/), id: str(/#id: "([^"]+)"/)
        });
    }
    return {
        offsetx: +rd[1], offsety: +rd[2],
        factorx: +rd[3], factory: +rd[4], factorh: rd[5] ? +rd[5] : +rd[4],
        els
    };
}

function deriveMask(png, room, ox, oy, tw, th) {
    const { w: W, h: H, rgba } = png;
    const at = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return null;
        const o = (y * W + x) * 4;
        return rgba[o + 3] === 0 ? null : [rgba[o], rgba[o + 1], rgba[o + 2]];
    };
    const topOf = (x, y) => ({ sx: ox + (x - y) * (tw / 2), sy: oy + (x + y) * (th / 2) });

    const N = room.grid;
    const frac = (tx, ty) => {
        const t = topOf(tx, ty);
        let ok = 0, n = 0;
        for (let dy = 3; dy < th - 2; dy += 2) {
            const hw = Math.round((dy < th / 2 ? dy : (th - dy)) * (tw / th));
            for (let dx = -hw + 2; dx <= hw - 2; dx += 3) {
                const p = at(Math.round(t.sx + dx), Math.round(t.sy + dy));
                if (!p) continue;
                n++;
                if (room.floorLooksLike(p[0], p[1], p[2])) ok++;
            }
        }
        return n ? ok / n : 0;
    };

    const raw = [];
    for (let y = 0; y < N; y++) {
        raw.push([]);
        for (let x = 0; x < N; x++) raw[y].push(frac(x, y) > 0.7);
    }

    // The biggest connected group, so a scrap of grey behind a bookcase does
    // not become an island nobody can walk to.
    const seen = Array.from({ length: N }, () => new Array(N).fill(false));
    let best = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!raw[y][x] || seen[y][x]) continue;
        const blob = [], st = [[x, y]];
        seen[y][x] = true;
        while (st.length) {
            const [cx, cy] = st.pop();
            blob.push([cx, cy]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[ny][nx] || !raw[ny][nx]) continue;
                seen[ny][nx] = true;
                st.push([nx, ny]);
            }
        }
        if (blob.length > best.length) best = blob;
    }

    /* NOT TRIMMED TO THE WALKABLE AREA, deliberately.

       Trimming to the bounding box gives the tidiest numbers and makes the
       grid impossible to extend: a builder correcting this by hand can only
       ever REMOVE tiles, because anything outside the box has no coordinates
       to paint on. The derived area is a guess from pixel colours, and the
       corrections that matter most are the ones that add a tile the classifier
       missed — under the gallery, behind a plant.

       So the whole scanned square is kept, holes and all, and the origin stays
       the room's own. It costs nothing: a 26x26 grid is 676 cells to iterate
       and the painted path never walks them. */
    const set = new Set(best.map(p => `${p[0]},${p[1]}`));
    const mask = [];
    for (let y = 0; y < N; y++) {
        let row = "";
        for (let x = 0; x < N; x++) row += set.has(`${x},${y}`) ? "0" : "x";
        mask.push(row);
    }
    return { mask, minX: 0, minY: 0, cols: N, rows: N, tiles: best.length };
}

function build(cctPath, roomKey) {
    const room = ROOMS[roomKey];
    if (!room) throw new Error(`no recipe for "${roomKey}"`);
    const { regs, cast, byName, fieldText } = castOf(cctPath);

    const parsed = parseRoom(fieldText(room.field));
    const bgEl = parsed.els.find(e => e.member === room.background);
    if (!bgEl) throw new Error(`no ${room.background} element`);
    const bgReg = regs.get(room.background);
    const bgLeft = bgEl.locH - bgReg.regX;
    const bgTop = bgEl.locV - bgReg.regY;

    // The grid origin, moved from stage coordinates into the picture's own.
    const ox = parsed.offsetx - bgLeft;
    const oy = parsed.offsety - bgTop;

    const outDir = path.join(__dirname, "..", "assets", "rooms", room.id);
    fs.mkdirSync(outDir, { recursive: true });

    // The background, straight out of the cast.
    const tmp = path.join(outDir, "background.png");
    if (!fs.existsSync(tmp)) throw new Error(`expected ${tmp} — run cct-extract for the background first`);
    const png = decodePng(fs.readFileSync(tmp));

    const derived = deriveMask(png, room, ox, oy, parsed.factorx, parsed.factory);

    /* The overlays, in the order the client sorts them. `locZ` is Director's
       own depth key; anything without one is part of the backdrop and sits
       behind everything. Kept so a later pass can draw them over the avatar
       and put it behind a bookcase, which is what the masks are for. */
    const overlays = parsed.els
        .filter(e => e.member !== room.background && e.member !== "ad_pixel")
        .map(e => {
            const r = regs.get(e.member);
            return {
                member: e.member,
                x: r ? e.locH - r.regX - bgLeft : null,
                y: r ? e.locV - r.regY - bgTop : null,
                w: r ? r.w : null, h: r ? r.h : null,
                ink: e.ink, blend: e.blend, z: e.locZ === null ? 0 : e.locZ
            };
        })
        .filter(e => e.x !== null)
        .sort((a, b) => a.z - b.z);

    return {
        id: room.id, name: room.name,
        image: `assets/rooms/${room.id}/background.png`,
        imageW: png.w, imageH: png.h,
        tileW: parsed.factorx, tileH: parsed.factory,
        // Origin of tile (minX,minY) inside the picture, after trimming.
        originX: ox + (derived.minX - derived.minY) * (parsed.factorx / 2),
        originY: oy + (derived.minX + derived.minY) * (parsed.factory / 2),
        cols: derived.cols, rows: derived.rows, tiles: derived.tiles,
        mask: derived.mask,
        overlays
    };
}

function emit(rooms) {
    const L = [];
    L.push(`/* Public rooms, painted rather than built.

   GENERATED by tools/public-room-extract.js — do not edit by hand. Its header
   explains how a public room differs from a private one and where each number
   here comes from.

   A public room is ONE PICTURE plus a walkable mask. There is no floor to lay
   and no walls to raise: \`image\` is the room, \`originX\`/\`originY\` say where
   tile (0,0) sits inside it, and \`tileW\`/\`tileH\` are 32x16 rather than the
   64x32 a private room uses — the client drew the big rooms at half scale
   because they do not fit the stage otherwise.

   \`mask\` is the same shape as a private layout's: one string per row, "0"
   where the floor can be walked and "x" where it cannot. It was derived from
   the artwork rather than read out of the client, which has no such grid —
   Habbo's server sent it at runtime.

   \`overlays\` is everything drawn ON TOP, in client depth order, kept for a
   later pass: the masks are what put an avatar behind a bookcase. */
(function () {
    "use strict";
`);
    L.push("    const ROOMS = [");
    for (const r of rooms) {
        L.push("        {");
        L.push(`            id: ${JSON.stringify(r.id)}, name: ${JSON.stringify(r.name)}, painted: true,`);
        L.push(`            image: ${JSON.stringify(r.image)}, imageW: ${r.imageW}, imageH: ${r.imageH},`);
        L.push(`            tileW: ${r.tileW}, tileH: ${r.tileH},`);
        L.push(`            originX: ${r.originX}, originY: ${r.originY},`);
        L.push(`            cols: ${r.cols}, rows: ${r.rows}, tiles: ${r.tiles}, door: 0,`);
        L.push("            mask: [");
        for (const row of r.mask) L.push(`                ${JSON.stringify(row)},`);
        L.push("            ],");
        /* The guess, kept untouched even when a hand-painted mask replaces it,
           so the editor's "back to the guess" has something to go back to. */
        L.push("            derived: [");
        for (const row of r.mask) L.push(`                ${JSON.stringify(row)},`);
        L.push("            ],");
        L.push("            overlays: [");
        for (const o of r.overlays) {
            L.push(`                { member: ${JSON.stringify(o.member)}, x: ${o.x}, y: ${o.y}, ` +
                   `w: ${o.w}, h: ${o.h}, ink: ${o.ink}, blend: ${o.blend}, z: ${o.z} },`);
        }
        L.push("            ]");
        L.push("        },");
    }
    L.push("    ];");
    L.push(`
    /* HAND CORRECTIONS WIN, and survive this file being regenerated.

       The walkable grid above was DERIVED from the artwork by sampling pixel
       colours, which is a good guess and only a guess: it cannot tell a patch
       of floor under a dark arch from the arch, and it has no idea whether the
       builder wants the carpet walked on. js/room-masks.js is hand-written —
       painted in the level editor's Walkable mode — and replaces the derived
       mask outright where it has one.

       Applied here rather than merged into the data above, because this file
       is regenerated from the client whenever the extractor is re-run and
       anything written into it is lost. */
    if (window.RoomMasks) {
        for (const r of ROOMS) {
            const over = window.RoomMasks[r.id];
            if (!Array.isArray(over) || !over.length) continue;
            if (over.length !== r.rows || over.some(row => row.length !== r.cols)) {
                console.warn("RoomMasks: \\"" + r.id + "\\" is " +
                    over[0].length + "x" + over.length + ", room is " +
                    r.cols + "x" + r.rows + " — override ignored.");
                continue;
            }
            r.mask = over.slice();
            r.tiles = over.join("").split("").filter(c => c !== "x").length;
        }
    }

    const byId = new Map(ROOMS.map(r => [r.id, r]));
    window.RoomPublic = { ROOMS, get: (id) => byId.get(id) || null };

    /* A PUBLIC ROOM IS A LAYOUT LIKE ANY OTHER as far as the rest of the game
       is concerned: it has a size, a mask and a door, which is everything a
       level needs to be normalised, walked and played against. So it joins the
       same list the private rooms are in, and the editor's picker, the level
       record and RoomIso.setLayout all take it without knowing the difference.

       Appended here rather than written into room-layouts.js because both
       files are generated from different casts by different tools, and neither
       should have to know when the other is re-run. Load order does the rest —
       this file comes after room-layouts.js. */
    if (window.RoomLayouts && Array.isArray(window.RoomLayouts.MODELS)) {
        for (const r of ROOMS) {
            if (!window.RoomLayouts.MODELS.some(m => m.id === r.id)) {
                window.RoomLayouts.MODELS.push(r);
            }
        }
        if (typeof window.RoomLayouts.register === "function") {
            ROOMS.forEach(window.RoomLayouts.register);
        }
    }
})();
`);
    return L.join("\n");
}

if (require.main === module) {
    const cct = process.argv[2] || DEFAULT_CCT;
    const key = process.argv[3] || "library";
    const room = build(cct, key);
    const out = path.join(__dirname, "..", "js", "room-public.js");
    fs.writeFileSync(out, emit([room]));
    console.log(`${room.id} "${room.name}"  ${room.cols}x${room.rows}  ${room.tiles} walkable tiles` +
                `  ${room.tileW}x${room.tileH} tiles  origin ${room.originX},${room.originY}` +
                `  ${room.overlays.length} overlays`);
    for (const r of room.mask) console.log("   " + r);
    console.log(`wrote ${out}`);
}

module.exports = { build, ROOMS };

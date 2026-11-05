/* The small stand-ins for Node, for the renderer in a browser (make-renderer.js). */
class Buffer extends Uint8Array {
    static alloc(n) { return new Buffer(n); }
    static from(x, enc) {
        if (typeof x === "string") { const b = new Buffer(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return b; }
        const b = new Buffer(x.length); b.set(x); return b;
    }
    static concat(list) { let n = 0; for (const b of list) n += b.length; const out = new Buffer(n); let p = 0; for (const b of list) { out.set(b, p); p += b.length; } return out; }
    copy(target, at = 0, from = 0, to = this.length) { target.set(Uint8Array.prototype.subarray.call(this, from, to), at); return to - from; }
    readUInt32BE(p) { return ((this[p] << 24) >>> 0) + (this[p + 1] << 16) + (this[p + 2] << 8) + this[p + 3]; }
    toString(enc, a = 0, b = this.length) { let s = ""; for (let i = a; i < b; i++) s += String.fromCharCode(this[i]); return s; }
}
const ROOT = "/site/tools/hallway-editor/", MAZES = "/site/tools/.cache/maze-list.txt";
const FILES = new Map(), INFLATED = new Map();
let mazeList = "", lastRead = null;
const posix = {
    normalize(p) { const out = []; for (const s of p.split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return "/" + out.join("/"); },
    resolve(...a) { let p = ""; for (const s of a) p = String(s).startsWith("/") ? s : p + "/" + s; return posix.normalize(p); },
    join(...a) { return posix.normalize(a.join("/")); },
    sep: "/", dirname(p) { return posix.normalize(p + "/.."); }
};
const relOf = p => { const n = posix.normalize(String(p)); return n.startsWith(ROOT) ? n.slice(ROOT.length) : n; };
const fsShim = {
    existsSync(p) { const r = relOf(p); return FILES.has(r) || r === MAZES; },
    statSync(p) { if (!this.existsSync(p)) throw new Error("No such file: " + p); return { mtimeMs: 1 }; },
    readFileSync(p, enc) {
        const r = relOf(p);
        if (r === MAZES) return mazeList;
        const f = FILES.get(r); if (!f) throw new Error("No such file: " + p);
        lastRead = r;
        if (!enc) return f;
        return enc === "latin1" ? f.toString("latin1") : new TextDecoder().decode(f);
    },
    writeFileSync() { throw new Error("Nothing is written here"); }
};
/* The art was unpacked ahead of time; the one just read is the one being asked for. */
const zlibShim = { inflateSync() { const b = INFLATED.get(lastRead); if (!b) throw new Error("Not unpacked: " + lastRead); return b; } };
const MODULES = {}, LOADED = {};
function requireFrom(dir) {
    return name => {
        if (name === "fs") return fsShim;
        if (name === "path") return posix;
        if (name === "zlib") return zlibShim;
        if (/png-encode\.js$/.test(name)) return { encodePng() { throw new Error("Not in a browser"); } };
        if (/regs\.json$/.test(name)) return JSON.parse(fsShim.readFileSync(ROOT + "art/regs.json", "utf8"));
        const base = name.split("/").pop();
        if (!MODULES[base]) throw new Error("No such module: " + name);
        if (LOADED[base]) return LOADED[base].exports;
        const m = LOADED[base] = { exports: {} };
        MODULES[base].run(m, m.exports, requireFrom(MODULES[base].dir), MODULES[base].dir);
        return m.exports;
    };
}
/* One PNG's compressed part, unpacked, so the reader can carry on without waiting */
async function inflatePng(bytes) {
    const b = Buffer.from(bytes), parts = []; let p = 8;
    while (p < b.length) {
        const len = b.readUInt32BE(p), type = b.toString("latin1", p + 4, p + 8);
        if (type === "IDAT") parts.push(b.subarray(p + 8, p + 8 + len));
        if (type === "IEND") break;
        p += 12 + len;
    }
    const stream = new Blob([Buffer.concat(parts)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return Buffer.from(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function loadArt(base) {
    let at = 0;
    const one = async () => {
        while (at < ART_FILES.length) {
            const rel = ART_FILES[at++], r = await fetch(base + "art/" + rel.split("/").map(encodeURIComponent).join("/")); if (!r.ok) throw new Error("Couldn't load " + rel);
            const f = Buffer.from(new Uint8Array(await r.arrayBuffer()));
            FILES.set("art/" + rel, f);
            if (rel.endsWith(".png")) INFLATED.set("art/" + rel, await inflatePng(f));
        }
    };
    await Promise.all(Array.from({ length: 8 }, one));
}

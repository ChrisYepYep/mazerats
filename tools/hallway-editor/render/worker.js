/* One drawing thread. Draws are slow, so they happen here: the server itself must stay free to
   answer, or a page reload hangs behind a queue of pictures. */
"use strict";
const { parentPort } = require("worker_threads");
const W = require("./hw3.js");
const { encodePng } = require("../../png-encode.js");

const maps = new Map();     // version -> parsed map; only the newest few are worth keeping

parentPort.on("message", job => {
    try {
        if (job.mapText) { maps.set(job.v, JSON.parse(job.mapText)); while (maps.size > 4) maps.delete(maps.keys().next().value); }
        const map = maps.get(job.v);
        if (!map) { parentPort.postMessage({ id: job.id, needMap: true }); return; }
        const { x, y, w, h } = job, cx = x + w / 2, cy = y + h / 2;
        const MX = (cx + 2 * cy) / 32, MY = (2 * cy - cx) / 32;
        /* a margin round the tile, as renderer-jobs.js draws the Warren's: without it, things standing just outside it (a stair rail's
           stub beside the F1 stair) weren't drawn, so the editor's tiles could differ from the published ones (9 Nov scan, renderer 4) */
        const PAD = 96;
        const world = W.build({ map, names: job.names, liftOpen: job.liftOpen, cut: job.cut, light: job.light, clip: [MX, MY, 0, w + 2 * PAD, h + 2 * PAD] });
        const c = world.at(MX, MY, 0);
        const crop = world.b.crop(c[0] - w / 2, c[1] - h / 2, w, h);
        const png = encodePng(w, h, crop.d);
        const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.length);
        parentPort.postMessage({ id: job.id, png: ab }, [ab]);
    } catch (e) {
        parentPort.postMessage({ id: job.id, error: String(e && e.stack || e) });
    }
});

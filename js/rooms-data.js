/* ===========================================================
   Maze Rats — fallback room data

   The site normally reads live room data from MongoDB via
   /.netlify/functions/rooms (see js/api.js) — use the Admin page to add
   or edit rooms there instead of editing this file.

   DEFAULT_ROOMS below is only a fallback, used if that API call fails
   (e.g. the database is unreachable), so the site still shows something
   instead of going blank. It's also what seeded the database originally.

   Fields:
     id          unique slug, lowercase-with-dashes
     name        room name as it appears in Habbo
     creator     Habbo username of the room owner
     status      "open" | "closed" | "unknown"
     hotel       which Habbo hotel this room is/was on (e.g. "Origins", "US", "NL")
     added       date added to the archive, "YYYY-MM-DD"
     tags        array of short tags, e.g. ["pixel maze","trap door","event"]
     thumb       path to a screenshot image, or "" to use the default maze texture
     description short description shown on the card
     details     longer writeup shown in the modal (optional, falls back to description)
     habboLink   navigator/room link if still visitable, or "" if unavailable
     gallery     optional array of image paths for a full room-by-room walkthrough,
                 shown in the modal as a browsable image viewer instead of a static thumb

   Thumbnail rule: when building a room's `thumb`, use pickThumb(dir, files) below
   instead of hardcoding a path. Drop an image with "entrance" in its filename into
   the room's folder (e.g. tlm_entrance.png) and it will automatically become the
   card thumbnail — no need to touch this file's data whenever the entrance shot
   changes. If no "entrance" file is found, it falls back to the first file listed.

   For rooms with a `gallery` walkthrough, that same entrance image should also be
   prepended to the gallery as "room zero" — the first thing you'd see stepping
   into the maze, ahead of numbered Room 1. Keep it in its own "cover files" list
   (not mixed into the numbered sequence) and spread it in front of the gallery
   array, as done for The Little Maze below.
   =========================================================== */

// Picks the thumbnail for a room: whichever filename contains "entrance" (case
// insensitive), or the first file in the list if none match.
function pickThumb(dir, files) {
    const entranceFile = files.find(f => f.toLowerCase().includes("entrance"));
    return dir + (entranceFile || files[0]);
}

// Derives a human-readable gallery label from a filename, e.g.
// "Room 001.png" -> "Room 1", "Room 026.1.png" -> "Room 26 (B)",
// "tlm_entrance.png" -> "Entrance". Used so the gallery viewer's caption
// always matches the room numbering, without maintaining a separate labels list.
function deriveGalleryLabel(path) {
    const filename = path.split("/").pop();
    if (/entrance/i.test(filename)) return "Entrance";
    const match = filename.match(/Room\s+0*(\d+)(?:\.(\d))?/i);
    if (!match) return filename.replace(/\.[a-z]+$/i, "");
    const num = parseInt(match[1], 10);
    if (match[2] !== undefined) {
        const variantLetter = String.fromCharCode(65 + parseInt(match[2], 10));
        return `Room ${num} (${variantLetter})`;
    }
    return `Room ${num}`;
}

// Full room-by-room screenshot walkthrough for "The Little Maze" (TLM).
const LITTLE_MAZE_DIR = "assets/rooms/the-little-maze/";
const LITTLE_MAZE_FILES = [
    "Room 001.png", "Room 002 NEW.png", "Room 003.png", "Room 004.png", "Room 005.png",
    "Room 006.png", "Room 007.png", "Room 008.png", "Room 009.png", "Room 010.png",
    "Room 011.png", "Room 012.png", "Room 013.png", "Room 014.png", "Room 015.png",
    "Room 016.png", "Room 017.png", "Room 018.png", "Room 019.png", "Room 020.png",
    "Room 021.png", "Room 022.png", "Room 023.png", "Room 024.png", "Room 025.png",
    "Room 026.0.png", "Room 026.1.png", "Room 027.png", "Room 028.png", "Room 029.png",
    "Room 030.png", "Room 031.png", "Room 032.png", "Room 033.png", "Room 034.png",
    "Room 035.png", "Room 036.png", "Room 037.png", "Room 038.png", "Room 039.png",
    "Room 040.png", "Room 041.png", "Room 042.png", "Room 043.png", "Room 044.png",
    "Room 045.png", "Room 046.png", "Room 047.png", "Room 048.png", "Room 049.png",
    "Room 050.png", "Room 051.png", "Room 052.png", "Room 053.png", "Room 054.png",
    "Room 055.png", "Room 056.png", "Room 057.png", "Room 058.png", "Room 059.png",
    "Room 060.png", "Room 061.png", "Room 062.png", "Room 063.png", "Room 064.png",
    "Room 065.png", "Room 066.png", "Room 067.png", "Room 068.png", "Room 069.png",
    "Room 070.png", "Room 071.png", "Room 072.png", "Room 073.png", "Room 074.png",
    "Room 075.png", "Room 076.png", "Room 077.png", "Room 078.png", "Room 079.png",
    "Room 080.png", "Room 081.png", "Room 082.png", "Room 083.png", "Room 084.png",
    "Room 085.png", "Room 086.png", "Room 087.png", "Room 088.png", "Room 089.png",
    "Room 090.png", "Room 091.png", "Room 092.png", "Room 093.png", "Room 094.png",
    "Room 095.png", "Room 096.png", "Room 097.png", "Room 098.png", "Room 099.png",
    "Room 100.png"
];

// Cover-only images that live in the room's folder but aren't part of the
// numbered walkthrough sequence (e.g. an establishing "entrance" shot).
const LITTLE_MAZE_COVER_FILES = ["tlm_entrance.png"];

const DEFAULT_ROOMS = [
    {
        id: "the-little-maze",
        name: "The Little Maze",
        creator: "ChrisYepYep",
        status: "open",
        hotel: "Unknown",
        added: "2026-08-23",
        tags: ["100-room walkthrough", "long-form"],
        thumb: pickThumb(LITTLE_MAZE_DIR, [...LITTLE_MAZE_COVER_FILES, ...LITTLE_MAZE_FILES]),
        description: "A 100-room maze built and documented from start to finish, room by room.",
        details: "The Little Maze (TLM), built by ChrisYepYep, is a long-form maze spanning 100 numbered rooms, beginning with [R01] Awakening. This entry preserves a full walkthrough of the maze as a browsable gallery — every room screenshotted in sequence, in-game captions and all.",
        habboLink: "",
        gallery: [...LITTLE_MAZE_COVER_FILES, ...LITTLE_MAZE_FILES].map(f => LITTLE_MAZE_DIR + f)
    }
];

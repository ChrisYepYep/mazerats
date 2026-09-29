/* Each day's deal for the daily games, dealt once on the server and kept.

   ----------------------------------------------------------------------
   WHY THE DEAL IS STORED

   Until this, nobody kept a day's deal at all. The page dealt it in the
   browser from the edge-cached /rooms list, and the score endpoints dealt it
   again from a live read of the rooms collection at the moment a score
   arrived, trusting the two shuffles to agree. They agreed only while the
   archive held still. existedBefore (in _daily.js) kept brand-new mazes out
   of a day already running, and that was the whole of the protection: a
   maze renamed at noon, a maze deleted, a tag edited, a picture added to a
   gallery — each of those re-dealt the day under everybody already playing,
   and so did a page holding an older copy of /rooms than the server read.
   Odd One Out then scored correct picks as wrong (the tile a player picked
   was the imposter in THEIR deal and a home-maze picture in the server's),
   and Guess the Maze only half coped through its answer cache.

   Now the first request for a day deals it and writes it to `daily_deals`,
   one document per (game, day) under a unique index. Every later request —
   the page asking what to play, a move being judged, a day being scored —
   reads that same document. An edit to the archive at noon changes
   tomorrow's deal, never today's.

   Two first requests can race: two containers, both finding no deal, both
   dealing one. The insert is what settles it. The unique index lets exactly
   one land; the loser's insert fails with a duplicate key and it re-reads
   the winner's, so both answer with the same deal even if they read the
   archive a moment apart and dealt different ones. Inserted rather than
   upserted, because an upsert would let the second writer's deal replace
   the first's — the very re-deal this exists to stop.

   ----------------------------------------------------------------------
   WHY THE SEED IS SECRET

   The seed used to be the date plus a salt that ships in the page
   (js/featured-days.js), and the shuffle ran in the browser — so tomorrow's
   rooms, and next month's, could be dealt by anybody willing to set their
   device clock forward, and the answers read off in advance. The seed is
   now an HMAC of the day under SESSION_SECRET, the secret every other
   signed thing on the site already uses (_auth.js, _player.js, track.js),
   so nothing outside the server can compute a future day. The featured-day
   salt is still stirred in, so a featured day still rerolls when the salt
   changes.

   If SESSION_SECRET is ever missing (a local setup without it), the seed
   falls back to the old public one rather than refusing to deal: the games
   still work, the deal is still stored and scored consistently, and the
   only thing lost is secrecy, which a missing secret has lost everywhere
   else on the site too. It says so in the log, once.

   The shuffle itself stays seeded and deterministic, and that is still
   worth having: two containers dealing the same day at the same moment deal
   the same thing, so the insert race above is usually a race between two
   identical deals. */
const crypto = require("crypto");
const { seededRandom, shuffle, daySeed, isHallway, existedBefore, FEATURED_DAYS } = require("./_daily");

const COLLECTION = "daily_deals";
const ROUNDS = 5;
const ODD_PER_ROUND = 4;        // three from the maze, one from elsewhere
const GUESS_OPTIONS = 5;        // names offered a round, one of them right

/* ---------------------------------------------------- the seed */

let warnedNoSecret = false;

/* The seed for a draw, as a 32-bit number. The parts are joined exactly as
   daySeed joins them, so the string being signed reads the same as the one
   that used to be hashed in public — only the hashing changed. */
function secretSeed(day, ...parts) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        if (!warnedNoSecret) {
            warnedNoSecret = true;
            console.warn("_deal: SESSION_SECRET is not set, so the daily deals fall back to the public seed");
        }
        return daySeed(day, ...parts);
    }
    const salt = FEATURED_DAYS[day] ? ":" + FEATURED_DAYS[day] : "";
    return crypto.createHmac("sha256", secret)
        .update("daily-deal:" + parts.join(":") + ":" + day + salt)
        .digest()
        .readUInt32BE(0);
}

/* ---------------------------------------------------- dealing

   Both dealers are PURE: rooms and a seed function in, rounds out. That is
   what lets tools/check-daily-parity.js deal a fixture archive twice and
   check the answers, without a database or a secret. */

const ROOM_PROJECTION = { id: 1, name: 1, slug: 1, creator: 1, tags: 1, gallery: 1, createdAt: 1 };

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const tagsOf = room => (room.tags || []).map(t => String(t).toLowerCase()).filter(Boolean);

/* Odd One Out: five rounds of four pictures, three from a home maze and one
   from an imposter that shares a tag with it where one can be found. The
   algorithm js/oddoneout.js ran in the browser, moved here unchanged apart
   from what it keeps: ids beside the names, so a round can still be traced
   to its mazes after one of them is renamed. */
function dealOdd(rooms, day, seedOf) {
    const pool = (rooms || [])
        // Hallways and mazes catalogued during the day are out, as they
        // always were — see isHallway and existedBefore in _daily.js.
        .filter(room => room && room.id && room.name && !isHallway(room))
        .filter(room => existedBefore(room, day))
        .map(room => ({
            id: room.id,
            name: room.name,
            tags: tagsOf(room),
            shots: (room.gallery || []).map(g => g && g.image).filter(Boolean)
        }))
        .filter(maze => maze.shots.length >= ODD_PER_ROUND - 1)
        // Sorted before the shuffle: the order going in decides what comes
        // out (see shuffle in _daily.js).
        .sort(byId);

    const shares = (a, b) => a.tags.some(t => t && b.tags.includes(t));
    const rounds = [];
    const usedHome = new Set();
    for (const home of shuffle(pool, seedOf("odd"))) {
        if (rounds.length >= ROUNDS) break;
        if (usedHome.has(home.id)) continue;

        const seed = seedOf("odd", home.id);
        const others = pool.filter(m => m.id !== home.id && m.shots.length);
        const related = others.filter(m => shares(home, m));
        const imposter = shuffle(related.length ? related : others, seed)[0];
        if (!imposter) continue;

        const mine = shuffle(home.shots, seed).slice(0, ODD_PER_ROUND - 1);
        if (mine.length < ODD_PER_ROUND - 1) continue;
        const theirs = shuffle(imposter.shots, seed)[0];

        const tiles = shuffle(
            mine.map(image => ({ image, odd: false })).concat([{ image: theirs, odd: true }]),
            seedOf("odd:tiles", home.id)
        );

        usedHome.add(home.id);
        rounds.push({ homeId: home.id, home: home.name, imposterId: imposter.id, imposter: imposter.name, tiles });
    }
    return rounds;
}

/* Guess the Maze: five room pictures from five different mazes where the
   archive allows it, each with the five names it is offered against — the
   right one and four decoys, preferring decoys that share a tag with the
   answer. Moved from js/guess.js (pickDay and optionsFor), which had to
   deal it in the browser; the page now gets the picture and the five names
   and nothing that says which name is right. `crop` is the seed the page
   uses to choose where to cut the picture, handed out rather than derived
   there so that nothing about a day is computable in the browser. */
function dealGuess(rooms, day, seedOf) {
    const live = (rooms || [])
        .filter(room => room && room.name && room.id && !isHallway(room))
        .filter(room => existedBefore(room, day))
        .sort(byId);

    const pool = [];
    live.forEach(room => {
        (room.gallery || []).forEach(g => {
            if (g && g.image) pool.push({ maze: room, image: g.image });
        });
    });
    // id then image, plain string comparison — see poolOrder's old note in
    // js/guess.js: a pool left in database order is not a reproducible one.
    pool.sort((a, b) => {
        if (a.maze.id !== b.maze.id) return a.maze.id < b.maze.id ? -1 : 1;
        if (a.image !== b.image) return a.image < b.image ? -1 : 1;
        return 0;
    });

    const rand = seededRandom(seedOf("guess"));
    const shuffled = pool.map(p => ({ p, k: rand() })).sort((a, b) => a.k - b.k).map(o => o.p);

    const chosen = [];
    const used = new Set();
    for (const item of shuffled) {
        if (chosen.length >= ROUNDS) break;
        if (used.has(item.maze.id)) continue;
        used.add(item.maze.id);
        chosen.push(item);
    }
    for (const item of shuffled) {
        if (chosen.length >= ROUNDS) break;
        if (!chosen.includes(item)) chosen.push(item);
    }

    return chosen.map((pick, i) => {
        const answer = pick.maze;
        const mine = new Set(tagsOf(answer));
        const others = live.filter(r => r.id !== answer.id);
        const seed = seedOf("guess:options", i, answer.id);
        const related = others.filter(r => tagsOf(r).some(t => mine.has(t)));
        const relatedIds = new Set(related.map(r => r.id));
        const rest = others.filter(r => !relatedIds.has(r.id));
        const decoys = shuffle(related, seed)
            .concat(shuffle(rest, (seed ^ 0x9e3779b9) >>> 0))
            .slice(0, GUESS_OPTIONS - 1);
        const options = shuffle([answer].concat(decoys), (seed ^ 0x85ebca6b) >>> 0).map(r => r.name);
        return {
            id: answer.id,
            name: answer.name,
            slug: answer.slug || null,
            creator: answer.creator || "",
            image: pick.image,
            options,
            crop: seedOf("guess:crop", i)
        };
    });
}

const DEALERS = { odd: dealOdd, guess: dealGuess };

/* ---------------------------------------------------- the picture addresses

   THE PICTURE'S OWN ADDRESS WAS AN ANSWER. publicRounds used to send each
   tile and each Guess picture as it is stored, and an uploaded picture is
   stored under rooms/<the maze's id or draft id>/… — so in Odd One Out the
   imposter was simply the one tile of four whose folder differed from the
   other three, and a Guess picture could be looked up in the public /rooms
   list to find the maze it belongs to. No playing needed; reading the deal
   reply was enough.

   Every picture a deal hands out is now an address on deal-image.js
   instead, which says nothing about where the picture lives:

     /.netlify/functions/deal-image?g=<game>&d=<day>&r=<round>&t=<tile>&s=<sig>

   `t` is the tile's place in its round (always 0 for Guess the Maze, one
   picture a round), and the tiles are already shuffled by the dealer, so
   the place says nothing either. `s` is an HMAC under SESSION_SECRET —
   the secret secretSeed deals with — of those four AND the stored picture
   reference itself. Two things follow from signing the reference too:

     - nobody can mint an address, for a day or a round they were not
       handed, without the secret; and an address can only ever mean the
       one picture it was signed for;
     - if a stored deal is corrected (see the note on the memo below: a
       picture deleted mid-day, fixed by editing or deleting the day's
       document), the corrected tile gets a NEW address. The old one stops
       verifying rather than serving the new picture under a URL that the
       edge may already hold the old bytes for — which, with the long
       immutable cache deal-image asks for, would have been one tile of a
       round showing yesterday's correction and not today's.

   THE PICTURE'S SIZE WAS AN ANSWER TOO (28 Sept 2026). With the address
   hidden, the bytes behind it were still the archive's own, and most
   mazes' screenshots share one pixel size per maze: the imposter was the
   one tile of four with a different naturalWidth/naturalHeight in about
   59% of Odd One Out rounds, and a Guess picture's shape matched only the
   right name of the five in about 47%. deal-image now serves every picture
   through the image CDN at one fixed size, shape and format per game (ONE
   SIZE PER GAME in deal-image.js), so every tile of a round and every
   round of a day measures the same, and the re-encoded bytes are no longer
   the archive file's own, so its byte count cannot be looked up either.

   WHAT THIS DOES NOT STOP. The picture still shows what it shows:
   somebody determined can fetch every picture in the public archive, put
   it through the same CDN pass (or simply compare by eye), match the tile
   they were dealt against them, and learn which maze it came from. A
   served file's length also still loosely follows how busy its picture
   is, as any compressed picture's does — a room from another maze can be
   plainer or busier than the other three, which the eye sees as well.
   That is a real effort against a daily game worth a few points, and it is
   the honest limit of hiding an answer in a picture everybody has to be
   able to see. It raises the bar from "read the JSON" or "read the
   picture sizes" to "build an index of the archive"; it does not make the
   game unbeatable, and nothing short of serving altered pictures would.

   If SESSION_SECRET is missing (a local setup without it) the addresses
   are signed with a fixed development key, and say so once in the log, as
   secretSeed does: the game still works, and what is lost is only what a
   missing secret has lost everywhere else on the site. deal-image still
   refuses a day outside its window whatever the signature says. */
const IMAGE_FUNCTION = "/.netlify/functions/deal-image";
const DEV_IMAGE_KEY = "mazerats-deal-image-no-secret";
let warnedNoImageSecret = false;

function imageKey() {
    const secret = process.env.SESSION_SECRET;
    if (secret) return secret;
    if (!warnedNoImageSecret) {
        warnedNoImageSecret = true;
        console.warn("_deal: SESSION_SECRET is not set, so the deal's picture addresses are signed with a development key");
    }
    return DEV_IMAGE_KEY;
}

/* The signature on one picture's address. Joined on newlines, which no
   stored image reference can contain (safeImageRef in _url.js refuses
   control characters), so no two different sets of fields can join into
   the same string. 128 bits of the HMAC, base64url so it sits in a query
   string untouched. */
function imageSig(game, day, round, tile, image) {
    return crypto.createHmac("sha256", imageKey())
        .update(["deal-image", game, day, round, tile, image].join("\n"))
        .digest("base64url")
        .slice(0, 22);
}

function imageAddress(game, day, round, tile, image) {
    const qs = new URLSearchParams({
        g: game, d: day, r: String(round), t: String(tile), s: imageSig(game, day, round, tile, image)
    });
    return IMAGE_FUNCTION + "?" + qs.toString();
}

/* The stored picture reference an address names, or null if the deal has
   no such picture. Guess the Maze has one picture a round, so only tile 0
   exists there. */
function imageRefAt(deal, game, round, tile) {
    const r = deal && Array.isArray(deal.rounds) ? deal.rounds[round] : null;
    if (!r) return null;
    if (game === "odd") {
        const t = Array.isArray(r.tiles) ? r.tiles[tile] : null;
        return t && typeof t.image === "string" && t.image ? t.image : null;
    }
    if (game === "guess") return tile === 0 && typeof r.image === "string" && r.image ? r.image : null;
    return null;
}

/* Whether `sig` is the signature for this picture, compared in constant
   time so the comparison cannot be timed a character at a time. */
function imageSigMatches(game, day, round, tile, image, sig) {
    if (typeof sig !== "string" || typeof image !== "string") return false;
    const want = Buffer.from(imageSig(game, day, round, tile, image));
    const got = Buffer.from(sig);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* What the page is sent: the pictures and, for Guess, the five names — and
   nothing that says which is right. Odd One Out's `odd` flags and both
   games' maze names and ids stay on the server until a move has been
   judged. Built field by field rather than by deleting the secret ones, so
   a field added to a stored round later is private until somebody decides
   otherwise.

   Each picture goes out as its deal-image address (see above), never as
   the stored reference. `day` is required for that, and a call without
   one THROWS rather than quietly falling back to the raw references — a
   caller that forgot the day would otherwise be the leak this closes. */
function publicRounds(game, rounds, day) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new Error("publicRounds needs the day, to sign the picture addresses");
    }
    if (game === "odd") {
        return (rounds || []).map((r, i) => ({
            tiles: (r.tiles || []).map((t, j) => ({ image: imageAddress("odd", day, i, j, t.image) }))
        }));
    }
    return (rounds || []).map((r, i) => ({
        image: imageAddress("guess", day, i, 0, r.image),
        options: r.options.slice(),
        crop: r.crop
    }));
}

/* ---------------------------------------------------- the snapshot */

/* A warm container keeps the deals it has read — only a handful: today,
   the day just ended, per game — but only for MEMO_TTL_MS.

   It used to keep them for the life of the container, on the grounds that
   a deal is never edited once written. The code never edits one; a person
   can. A picture deleted from the archive mid-day leaves today's stored
   deal pointing at nothing, and the fix is to correct (or delete, so it is
   dealt again) the document in daily_deals — which every container that
   had already read the day then ignored until Netlify happened to recycle
   it, so the same day was judged against two different deals depending on
   which container answered. A minute is short enough that a correction
   reaches everybody before anyone has noticed two answers, and long enough
   that a busy day still reads the collection about once a minute per
   container rather than once a move. */
const memo = new Map();
const MEMO_MAX = 8;
const MEMO_TTL_MS = 60 * 1000;
function remember(key, doc) {
    memo.delete(key);          // re-inserted, so the oldest is still first out
    memo.set(key, { doc, at: Date.now() });
    while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
}
function recalled(key) {
    const hit = memo.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > MEMO_TTL_MS) { memo.delete(key); return null; }
    return hit.doc;
}

/* The day's deal: read if it was stored, dealt and stored if not.

   The CALLER decides whether the day is one a deal may be released for
   (dayIsOpen in _daily.js); this never looks at the clock, so it cannot be
   the thing that hands out tomorrow.

   A deal with no rounds is returned but NOT stored: an archive that read as
   empty is far more likely a bad moment than a real state, and storing it
   would fix the day at nothing to play. The next request deals again.

   ensureUniqueIndex throws if the index cannot be built, and that is left
   to throw: without the index two containers could each store a different
   deal for the same day, which is the whole failure being removed. */
async function dealFor(db, ensureUniqueIndex, game, day) {
    const dealer = DEALERS[game];
    if (!dealer) throw new Error("no such daily game: " + game);
    const key = game + ":" + day;
    const held = recalled(key);
    if (held) return held;

    const col = db.collection(COLLECTION);
    await ensureUniqueIndex(col, ["game", "day"]);

    let doc = await col.findOne({ game, day }, { projection: { _id: 0 } });
    if (!doc) {
        const rooms = await db.collection("rooms").find({}, { projection: ROOM_PROJECTION }).toArray();
        const rounds = dealer(rooms, day, (...parts) => secretSeed(day, ...parts));
        if (!rounds.length) return { game, day, rounds: [] };
        const fresh = {
            game, day, rounds,
            // Which seed dealt it, for anyone reading the collection later
            // and wondering why a day looks nothing like its public seed.
            seed: process.env.SESSION_SECRET ? "secret" : "public",
            at: new Date().toISOString()
        };
        try {
            await col.insertOne(Object.assign({}, fresh));
            doc = fresh;
        } catch (e) {
            if (!(e && e.code === 11000)) throw e;
            // Somebody else stored the day first. Theirs is the deal.
            doc = await col.findOne({ game, day }, { projection: { _id: 0 } });
            if (!doc) throw e;
        }
    }
    remember(key, doc);
    return doc;
}

/* The day's deal ONLY IF IT IS ALREADY STORED — null otherwise, and never
   dealt here. For deal-image.js, which is reached by addresses a deal reply
   handed out, so the day it names has always been dealt by the time a
   genuine request arrives. Reading without dealing means no request for a
   picture, however it is made, can be what causes a day to be dealt. The
   same memo as dealFor, so a busy day's pictures cost about one read a
   minute per container rather than one per tile. */
async function storedDeal(db, game, day) {
    if (!DEALERS[game]) return null;
    const key = game + ":" + day;
    const held = recalled(key);
    if (held) return held;
    const doc = await db.collection(COLLECTION).findOne({ game, day }, { projection: { _id: 0 } });
    if (!doc) return null;
    remember(key, doc);
    return doc;
}

module.exports = {
    COLLECTION, ROUNDS, ROOM_PROJECTION, MEMO_TTL_MS, IMAGE_FUNCTION,
    secretSeed, dealOdd, dealGuess, publicRounds, dealFor, storedDeal,
    imageSig, imageAddress, imageRefAt, imageSigMatches,
    _forgetMemo: () => memo.clear()      // for the tests only
};

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

/* What the page is sent: the pictures and, for Guess, the five names — and
   nothing that says which is right. Odd One Out's `odd` flags and both
   games' maze names and ids stay on the server until a move has been
   judged. Built field by field rather than by deleting the secret ones, so
   a field added to a stored round later is private until somebody decides
   otherwise. */
function publicRounds(game, rounds) {
    if (game === "odd") {
        return (rounds || []).map(r => ({ tiles: (r.tiles || []).map(t => ({ image: t.image })) }));
    }
    return (rounds || []).map(r => ({ image: r.image, options: r.options.slice(), crop: r.crop }));
}

/* ---------------------------------------------------- the snapshot */

/* Deals are never edited once written, so a warm container can keep the
   ones it has read. Only a handful: today, the day just ended, per game. */
const memo = new Map();
const MEMO_MAX = 8;
function remember(key, doc) {
    memo.set(key, doc);
    while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
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
    if (memo.has(key)) return memo.get(key);

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

module.exports = {
    COLLECTION, ROUNDS, ROOM_PROJECTION,
    secretSeed, dealOdd, dealGuess, publicRounds, dealFor,
    _forgetMemo: () => memo.clear()      // for the tests only
};

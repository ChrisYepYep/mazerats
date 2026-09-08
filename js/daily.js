/* What a "day" is, and how a day picks the same things for everybody.

   Two games now deal a set from the archive once a day, and both need the
   same three answers: when the day turns over, how a date becomes a seed,
   and what a seeded shuffle does with it. Written once here because the
   moment there are two copies there are two day boundaries, and the first
   anyone hears about that is somebody in Discord saying their five rooms
   are not your five rooms.

   None of this is security. A determined reader can work out today's answers
   from the page — that is true of every daily game that ships its own data —
   and the point is reproducibility, not secrecy. */
window.Daily = (function () {
    "use strict";

    /* The date in UTC, so the day turns over at the same instant for
       everybody rather than at each player's local midnight. Two people
       comparing grids in a channel are then always talking about the same
       puzzle, whichever side of the world they are on. */
    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    // mulberry32 — small, fast, and good enough that consecutive days do not
    // visibly rhyme.
    function seededRandom(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // FNV-1a. Any string in, one stable number out.
    function seedFrom(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /* A shuffle that depends only on the seed and the order it was handed.

       That second half is the part that bites: the shuffle draws one number
       per entry in sequence, so which items come out depends on what order
       they went in. A list left in the order the database returned it is not
       a stable order — rewriting a document can move it — and an admin
       saving an edit at noon would quietly deal a different set for the rest
       of the day. Every caller sorts its pool by something of its own first,
       and this leaves that order alone. */
    function shuffle(list, seed) {
        const rand = seededRandom(seed);
        return list
            .map(item => ({ item, k: rand() }))
            .sort((a, b) => a.k - b.k)
            .map(o => o.item);
    }

    // Yesterday's key, for deciding whether a streak survived.
    function dayBefore(iso) {
        const d = new Date(iso + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    return { today, seededRandom, seedFrom, shuffle, dayBefore };
})();

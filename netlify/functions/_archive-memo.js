/* The archive kept in a warm instance's memory (4 Nov 2026, the bug scan).

   Every time the edge renewed /rooms or /events, the function read the whole
   collection from Mongo to work out an answer that had almost never changed:
   about 1.16GB a day over the wire, to learn that nothing was new. Now an
   instance keeps the records it read and asks one small question first: has
   anybody written since? The answer is worked out from the kept records just
   as it was from fresh ones, so what the public receives is unchanged, furni
   and all.

   WHY A REVISION AND NOT THE NEWEST updatedAt. updatedAt is What's New's
   date, and many writes leave it alone on purpose: a furni scan, the furni
   tick, the spotlight order, a save that only tidied a value, and every
   delete. So each write to these collections stamps a row in archive_revs
   with a new value, after the write and before the answer goes back, and any
   instance's next read sees it. A reader takes the revision BEFORE reading
   the records, so a write landing in between makes the records newer than
   their revision and costs one extra read, never a stale copy.

   MAX_AGE_MS is the floor under all that: a write that stamped nothing (a
   hand edit in Atlas, a tool that does not know about this) is picked up
   within ten minutes, and so is a stamp that failed. */
const crypto = require("crypto");
const { loadRetired } = require("./_slugs");

const REVS = "archive_revs";
const MAX_AGE_MS = 10 * 60 * 1000;

// Never throws: the write has landed, and the floor above covers a lost stamp.
async function stampArchive(db, collectionName) {
    try {
        await db.collection(REVS).updateOne(
            { _id: collectionName },
            { $set: { rev: crypto.randomBytes(8).toString("hex"), at: new Date() } },
            { upsert: true }
        );
    } catch (e) {
        console.error(`archive-memo: could not stamp ${collectionName}`, e);
    }
}

/* A save that was refused changed nothing, so it does not make every instance
   read the archive again (and a stranger's refused POSTs cannot make them).
   A 5xx may have written part of its work, and a 409 can follow a write that
   lost its answer, so those count. */
function mayHaveWritten(event, res) {
    if (!event || event.httpMethod === "GET" || event.httpMethod === "HEAD") return false;
    const code = res && res.statusCode;
    return !(code >= 400 && code < 500 && code !== 409);
}

function archiveMemo(collectionName, kind) {
    let memo = null;

    /* { docs, retired }. SHARED: the caller copies before changing anything,
       a shallow copy of each record being enough for what the public answer
       does to them (`copies` below). Throws as a read would. */
    async function read(db) {
        const row = await db.collection(REVS).findOne({ _id: collectionName }, { projection: { _id: 0, rev: 1 } });
        const rev = row ? row.rev : null;
        if (memo && memo.rev === rev && Date.now() - memo.at < MAX_AGE_MS) return memo;
        const docs = await db.collection(collectionName).find({}, { projection: { _id: 0 } }).toArray();
        /* Unreadable retired addresses are none for this answer, as they have
           always been, but such a read is not kept: they are asked for again
           next time rather than remembered as none. */
        const retired = await loadRetired(db, kind).catch(e => {
            console.error(`${collectionName}: retired addresses unreadable`, e);
            return null;
        });
        const read = { rev, at: Date.now(), docs, retired: retired || [] };
        memo = retired ? read : null;
        return read;
    }

    // After a write in this instance: no need to wait for the question.
    async function wrote(db) {
        memo = null;
        await stampArchive(db, collectionName);
    }

    return { read, wrote, _forget() { memo = null; } };
}

const copies = docs => docs.map(r => ({ ...r }));

module.exports = { archiveMemo, stampArchive, mayHaveWritten, copies, REVS, MAX_AGE_MS };

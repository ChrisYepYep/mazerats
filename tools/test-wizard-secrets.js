/* The secret-passage half of netlify/functions/wizard.js, exercised against a
   fake collection with the four modules it requires stubbed out.

   No database and no network: it is the request handler run directly, which
   is what makes it worth having. The things it checks are the ones that are
   invisible when they break — a locked room quietly present in the public
   payload leaks the whole puzzle and looks exactly like everything working.

     node tools/test-wizard-secrets.js
*/
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..", "netlify", "functions");

let DOCS = [];

function fakeCollection() {
    const match = (doc, q) => Object.entries(q).every(([k, v]) => {
        if (k === "$or") return v.some(sub => match(doc, sub));
        if (v && typeof v === "object" && "$in" in v) return v.$in.includes(doc[k]);
        if (v && typeof v === "object" && "$nin" in v) return !v.$nin.includes(doc[k]);
        if (v && typeof v === "object" && "$ne" in v) return doc[k] !== v.$ne;
        return doc[k] === v;
    });
    return {
        find: (q = {}) => ({ toArray: async () => DOCS.filter(d => match(d, q)).map(d => ({ ...d })) }),
        findOne: async (q = {}) => { const d = DOCS.find(x => match(x, q)); return d ? { ...d } : null; },
        createIndex: async () => {},
        updateMany: async () => ({}),
        deleteMany: async () => ({}),
        deleteOne: async () => ({ deletedCount: 1 }),
        insertOne: async () => ({}),
        updateOne: async () => ({}),
        findOneAndUpdate: async () => null,
        bulkWrite: async () => ({ modifiedCount: 0 })
    };
}

// Stub the four local requires before wizard.js asks for them.
const stubs = {
    "./_db": { getDb: async () => ({ collection: () => fakeCollection() }) },
    "./_auth": {
        isAuthorized: e => (e.headers || {}).authorization === "token",
        // wizard.js grew these (the ?fresh=1 account check and the
        // auth-unavailable answer) and the stub did not, so the require
        // destructured undefined and the first GET threw (30 Sept 2026).
        hasAccount: async e => (e.headers || {}).authorization === "token",
        canWrite: async () => true,
        refuseWrite: async () => ({ statusCode: 403 }),
        isAuthUnavailable: () => false,
        UNAUTHORIZED: { statusCode: 401 },
        AUTH_UNAVAILABLE: { statusCode: 503 }
    },
    "./_cache": { cachedJson: (e, data) => ({ statusCode: 200, body: JSON.stringify(data) }) },
    "./_headers": { SECURITY_HEADERS: {} }
};

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (stubs[request]) return request;
    return realResolve.call(this, request, ...rest);
};
for (const [name, value] of Object.entries(stubs)) {
    require.cache[name] = { id: name, filename: name, loaded: true, exports: value };
}

const wizard = require(path.join(ROOT, "wizard.js"));

/* What the page is sent in place of a real id (30 Sept 2026): see
   publicRecordId in the endpoint. R/T turn the fixture's own ids into the
   ones the public GET and the unlock carry, so the checks below can still be
   written in terms of r039 and t-open. */
const R = id => wizard.publicRecordId("room", id);
const T = id => wizard.publicRecordId("path", id);
const REAL_IDS = ["r039", "r062", "r063", "r101", "r200", "t-open", "t-secret", "t-dangling",
    "t-cross", "t-named-cross", "t-shared-link"];
// Quoted, so "r039" does not also match inside some longer string.
const realIdIn = body => REAL_IDS.filter(id => JSON.stringify(body).includes(`"${id}"`)
    || JSON.stringify(body).includes(`:${id}"`));

// ---------- the fixture ----------
DOCS = [
    { kind: "map", id: "map", title: "The Sorcerer's Atlas" },
    { kind: "room", id: "r039", name: "Library", x: 10, y: 10 },
    { kind: "room", id: "r062", name: "The One Eyed Witch Passage", x: 40, y: 60 },
    { kind: "room", id: "r063", name: "Secret Passage (1)", x: 44, y: 64 },
    { kind: "room", id: "r101", name: "Hog's Head Inn", x: 80, y: 20 },
    { kind: "path", id: "t-open", from: "r039", to: "r101", points: [[10, 10], [80, 20]],
        notes: "the builder's own note", locked: true, updatedAt: "2026-09-30T00:00:00Z" },
    { kind: "path", id: "t-secret", from: "r062", to: "r063", points: [[40, 60], [44, 64]], notes: "behind the hump" },
    // Names a held-back room at one end but is NOT itself listed by the
    // secret — the case that would otherwise draw a trail into nowhere.
    { kind: "path", id: "t-dangling", from: "r039", to: "r062", points: [[10, 10], [40, 60]] },
    {
        kind: "reveal", id: "one-eyed-witch", name: "The One-Eyed Witch Passage",
        code: "dissendium", hint: "Whispered at a statue.", message: "The hump slides aside.",
        rooms: ["r062", "r063"], paths: ["t-secret"], enabled: true,
        focusX: null, focusY: null, focusZoom: null,
        sequence: ["path:t-secret", "room:r062", "room:r063"],
        landing: "r062"
    },
    {
        kind: "reveal", id: "switched-off", name: "Old news", code: "alohomora",
        rooms: ["r101"], paths: [], enabled: false
    }
];

const get = async (headers = {}, qs = null) => JSON.parse((await wizard.handler({
    httpMethod: "GET", headers, queryStringParameters: qs
})).body);

const post = async (body, headers = {}) => {
    const res = await wizard.handler({ httpMethod: "POST", headers, body: JSON.stringify(body) });
    return { status: res.statusCode, body: JSON.parse(res.body) };
};

let failures = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
    if (!ok) console.log(`         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);
}

(async () => {
    console.log("\n--- the public payload ---");
    const pub = await get();
    check("locked rooms are absent", pub.rooms.map(r => r.id).sort(), [R("r039"), R("r101")].sort());
    check("the secret's own trail is absent", pub.paths.some(p => p.id === T("t-secret")), false);
    check("a trail into a locked room is absent", pub.paths.some(p => p.id === T("t-dangling")), false);
    check("an ordinary trail survives", pub.paths.map(p => p.id), [T("t-open")]);
    check("a DISABLED secret holds nothing back", pub.rooms.some(r => r.id === R("r101")), true);
    // Opaque ids (30 Sept 2026): a gap in r061, r064 said two rooms were
    // being held back between them.
    check("no real room or trail id appears in the public body", realIdIn(pub), []);
    check("...the public ids are opaque",
        pub.rooms.every(r => /^r[0-9a-f]{12}$/.test(r.id)) && pub.paths.every(p => /^t[0-9a-f]{12}$/.test(p.id)), true);
    check("...and a trail's ends are the rooms' public ids",
        [pub.paths[0].from, pub.paths[0].to], [R("r039"), R("r101")]);
    check("...as are the pictures'", pub.layers === undefined || pub.layers.every(l => /^l[0-9a-f]{12}$/.test(l.id)), true);
    // The id is the opaque keyed hash (see publicSecretId), never the slug —
    // "one-eyed-witch" in the public list would answer the riddle.
    check("secrets are listed as id + hint only",
        pub.secrets.map(s => Object.keys(s).sort()), [["hint", "id"]]);
    check("...and the id is opaque, not the slug",
        pub.secrets.map(s => /^s[0-9a-f]{16}$/.test(s.id) && s.id !== "one-eyed-witch"), [true]);
    check("...with the hint intact", pub.secrets.map(s => s.hint), ["Whispered at a statue."]);
    check("no code appears anywhere in the public body",
        JSON.stringify(pub).includes("dissendium"), false);
    check("no locked room NAME appears either",
        JSON.stringify(pub).includes("One Eyed Witch"), false);
    // The editor's bookkeeping stays in the editor (30 Sept 2026).
    check("a trail's notes, lock and timestamps are not sent",
        ["notes", "locked", "updatedAt"].filter(f => f in pub.paths[0]), []);

    console.log("\n--- the editor's payload ---");
    const fresh = await get({ authorization: "token" }, { fresh: "1" });
    check("the editor sees locked rooms", fresh.rooms.map(r => r.id).sort(),
        ["r039", "r062", "r063", "r101"]);
    check("the editor sees the codes", fresh.reveals[0].code, "dissendium");
    check("...and the trail notes", fresh.paths.find(p => p.id === "t-open").notes, "the builder's own note");
    const denied = await wizard.handler({ httpMethod: "GET", headers: {}, queryStringParameters: { fresh: "1" } });
    check("?fresh=1 without a token is refused", denied.statusCode, 401);

    console.log("\n--- unlocking ---");
    const wrong = await post({ action: "unlock", code: "nonsense" });
    check("a wrong word reveals nothing", wrong.body, { ok: false, found: [] });

    const right = await post({ action: "unlock", code: "  DISSENDIUM  " });
    check("case and spacing do not matter", right.body.ok, true);
    check("it returns the held rooms", right.body.found[0].rooms.map(r => r.id), [R("r062"), R("r063")]);
    check("it returns the held trail", right.body.found[0].paths.map(p => p.id).includes(T("t-secret")), true);
    check("...without the editor's notes on it",
        right.body.found[0].paths.find(p => p.id === T("t-secret")).notes, undefined);
    check("no real room or trail id appears in the unlock either", realIdIn(right.body), []);
    // The records join up: the linking trail's public end is the public
    // GET's room, and the running order names the records it was sent.
    const pubIds = new Set(pub.rooms.map(r => r.id));
    const gotIds = new Set(right.body.found[0].rooms.map(r => r.id));
    check("an unlocked trail's ends are rooms the page now has",
        right.body.found[0].paths.every(p => [p.from, p.to].every(id => !id || pubIds.has(id) || gotIds.has(id))), true);
    const gotPaths = new Set(right.body.found[0].paths.map(p => p.id));
    check("...and the running order and landing name records it was sent",
        right.body.found[0].secret.sequence.every(e => {
            const [kind, id] = e.split(/:(.+)/);
            return kind === "room" ? gotIds.has(id) : gotPaths.has(id);
        }) && gotIds.has(right.body.found[0].secret.landing), true);
    check("...and the same room has the same id in the GET and the unlock",
        (await get()).rooms.map(r => r.id).sort(), pub.rooms.map(r => r.id).sort());
    check("it returns the name and message",
        [right.body.found[0].secret.name, right.body.found[0].secret.message],
        ["The One-Eyed Witch Passage", "The hump slides aside."]);

    const off = await post({ action: "unlock", code: "alohomora" });
    check("a switched-off secret cannot be unlocked", off.body.ok, false);

    const empty = await post({ action: "unlock", code: "   " });
    check("an empty guess is not a guess", empty.body.ok, false);

    const batch = await post({ action: "unlock", codes: ["dissendium", "nope"] });
    check("a batch returns only what matched", batch.body.found.length, 1);

    // Codes match by letters and digits only, so a stored hyphen does not
    // lock out the desktop keyboard, which cannot type one.
    DOCS.push({ kind: "reveal", id: "wing", name: "Wing", code: "wingardium-leviosa", rooms: [], paths: [], enabled: true });
    const typed = [];
    for (const [i, guess] of ["wingardium leviosa", "wingardiumleviosa", "xx Wingardium-Leviosa"].entries()) {
        typed.push((await post({ action: "unlock", code: guess }, { "client-ip": "8.8.8." + i })).body.ok);
    }
    check("a hyphenated code opens with a space, with nothing, or as stored", typed, [true, true, true]);
    DOCS.splice(DOCS.findIndex(d => d.id === "wing"), 1);

    console.log("\n--- the trails that link it back to the map ---");
    // t-dangling runs from a public room (r039) into a held one (r062). The
    // public GET drops it; unlocking has to give it back, or the passage
    // arrives with no way into it.
    check("a linking trail comes back too",
        right.body.found[0].paths.map(p => p.id).sort(), [T("t-dangling"), T("t-secret")].sort());
    check("revealed records are handed over unhidden",
        right.body.found[0].rooms.every(r => r.hidden === false), true);

    // A linking trail whose FAR end is behind a different, still-locked
    // secret must stay behind — it would otherwise draw to a room that is
    // not on the map.
    DOCS.push(
        { kind: "room", id: "r200", name: "Behind Another Door", x: 20, y: 20 },
        { kind: "path", id: "t-cross", from: "r062", to: "r200", points: [[40, 60], [20, 20]] },
        { kind: "reveal", id: "other", name: "Another", code: "aparecium", rooms: ["r200"], paths: [], enabled: true }
    );
    const cross = await post({ action: "unlock", code: "dissendium" }, { "client-ip": "5.5.5.5" });
    check("a trail into a STILL-locked room is withheld",
        cross.body.found[0].paths.some(p => p.id === T("t-cross")), false);
    const both = await post({ action: "unlock", codes: ["dissendium", "aparecium"] }, { "client-ip": "6.6.6.6" });
    check("...and arrives once both secrets are open",
        both.body.found.some(f => f.paths.some(p => p.id === T("t-cross"))), true);

    // Nothing of a still-locked secret rides out on an opened one: not in a
    // revealed room's exits, and not at the end of a trail the opened secret
    // names itself. r200 is held by "other".
    const witch = DOCS.find(d => d.kind === "reveal" && d.id === "one-eyed-witch");
    DOCS.find(d => d.id === "r062").exits = ["r200", { to: "r039" }];
    DOCS.push({ kind: "path", id: "t-named-cross", from: "r063", to: "r200", points: [[44, 64], [20, 20]] });
    witch.paths = ["t-secret", "t-named-cross"];
    // A running order and a landing left naming a room the secret no longer
    // holds — the editor tidies its own copy, the stored one can lag.
    const keptOrder = witch.sequence, keptLanding = witch.landing;
    witch.sequence = [...keptOrder, "room:r200"];
    witch.landing = "r200";
    const leak = await post({ action: "unlock", code: "dissendium" }, { "client-ip": "7.7.7.7" });
    witch.sequence = keptOrder;
    witch.landing = keptLanding;
    check("an opened secret leaks no room of a locked one (exits, trails, order, landing)",
        [R("r200"), "r200"].some(id => JSON.stringify(leak.body).includes(id)), false);
    check("...and its own order survives the filtering",
        leak.body.found[0].secret.sequence, [`path:${T("t-secret")}`, `room:${R("r062")}`, `room:${R("r063")}`]);
    check("...while its exits to the open map survive",
        leak.body.found[0].rooms.find(r => r.id === R("r062")).exits, [{ to: R("r039") }]);
    check("...and a named trail to a locked room is left out",
        leak.body.found[0].paths.some(p => p.id === T("t-named-cross")), false);
    const leakBoth = await post({ action: "unlock", codes: ["dissendium", "aparecium"] }, { "client-ip": "7.7.7.8" });
    check("...until that secret is opened as well",
        leakBoth.body.found.find(f => f.paths.some(p => p.id === T("t-named-cross"))) !== undefined, true);
    check("...still without a real id in it", realIdIn(leakBoth.body), []);

    // A room two secrets share: opening one of them opens the room, so the
    // trails joining it to the map come back with it.
    DOCS.push(
        { kind: "path", id: "t-shared-link", from: "r039", to: "r063", points: [[10, 10], [44, 64]] },
        { kind: "reveal", id: "shared", name: "Shared", code: "lumos", rooms: ["r063"], paths: [], enabled: true }
    );
    const shared = await post({ action: "unlock", code: "dissendium" }, { "client-ip": "7.7.7.9" });
    check("a room shared by two secrets keeps its linking trail",
        shared.body.found[0].paths.some(p => p.id === T("t-shared-link")), true);

    console.log("\n--- the rate limit ---");
    let hit429 = 0;
    for (let i = 0; i < 20; i++) {
        const r = await post({ action: "unlock", code: "guess" + i }, { "client-ip": "1.2.3.4" });
        if (r.status === 429) hit429++;
    }
    check("guessing fast is cut off", hit429 > 0, true);
    const other = await post({ action: "unlock", code: "dissendium" }, { "client-ip": "9.9.9.9" });
    check("the limit is per address", other.body.ok, true);

    console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
    process.exit(failures ? 1 : 0);
})();

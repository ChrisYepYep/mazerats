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
        canWrite: async () => true,
        refuseWrite: async () => ({ statusCode: 403 }),
        UNAUTHORIZED: { statusCode: 401 }
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

// ---------- the fixture ----------
DOCS = [
    { kind: "map", id: "map", title: "The Sorcerer's Atlas" },
    { kind: "room", id: "r039", name: "Library", x: 10, y: 10 },
    { kind: "room", id: "r062", name: "The One Eyed Witch Passage", x: 40, y: 60 },
    { kind: "room", id: "r063", name: "Secret Passage (1)", x: 44, y: 64 },
    { kind: "room", id: "r101", name: "Hog's Head Inn", x: 80, y: 20 },
    { kind: "path", id: "t-open", from: "r039", to: "r101", points: [[10, 10], [80, 20]] },
    { kind: "path", id: "t-secret", from: "r062", to: "r063", points: [[40, 60], [44, 64]] },
    // Names a held-back room at one end but is NOT itself listed by the
    // secret — the case that would otherwise draw a trail into nowhere.
    { kind: "path", id: "t-dangling", from: "r039", to: "r062", points: [[10, 10], [40, 60]] },
    {
        kind: "reveal", id: "one-eyed-witch", name: "The One-Eyed Witch Passage",
        code: "dissendium", hint: "Whispered at a statue.", message: "The hump slides aside.",
        rooms: ["r062", "r063"], paths: ["t-secret"], enabled: true,
        focusX: null, focusY: null, focusZoom: null
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
    check("locked rooms are absent", pub.rooms.map(r => r.id).sort(), ["r039", "r101"]);
    check("the secret's own trail is absent", pub.paths.some(p => p.id === "t-secret"), false);
    check("a trail into a locked room is absent", pub.paths.some(p => p.id === "t-dangling"), false);
    check("an ordinary trail survives", pub.paths.map(p => p.id), ["t-open"]);
    check("a DISABLED secret holds nothing back", pub.rooms.some(r => r.id === "r101"), true);
    check("secrets are listed as id + hint only",
        pub.secrets, [{ id: "one-eyed-witch", hint: "Whispered at a statue." }]);
    check("no code appears anywhere in the public body",
        JSON.stringify(pub).includes("dissendium"), false);
    check("no locked room NAME appears either",
        JSON.stringify(pub).includes("One Eyed Witch"), false);

    console.log("\n--- the editor's payload ---");
    const fresh = await get({ authorization: "token" }, { fresh: "1" });
    check("the editor sees locked rooms", fresh.rooms.map(r => r.id).sort(),
        ["r039", "r062", "r063", "r101"]);
    check("the editor sees the codes", fresh.reveals[0].code, "dissendium");
    const denied = await wizard.handler({ httpMethod: "GET", headers: {}, queryStringParameters: { fresh: "1" } });
    check("?fresh=1 without a token is refused", denied.statusCode, 401);

    console.log("\n--- unlocking ---");
    const wrong = await post({ action: "unlock", code: "nonsense" });
    check("a wrong word reveals nothing", wrong.body, { ok: false, found: [] });

    const right = await post({ action: "unlock", code: "  DISSENDIUM  " });
    check("case and spacing do not matter", right.body.ok, true);
    check("it returns the held rooms", right.body.found[0].rooms.map(r => r.id), ["r062", "r063"]);
    check("it returns the held trail", right.body.found[0].paths.map(p => p.id).includes("t-secret"), true);
    check("it returns the name and message",
        [right.body.found[0].secret.name, right.body.found[0].secret.message],
        ["The One-Eyed Witch Passage", "The hump slides aside."]);

    const off = await post({ action: "unlock", code: "alohomora" });
    check("a switched-off secret cannot be unlocked", off.body.ok, false);

    const empty = await post({ action: "unlock", code: "   " });
    check("an empty guess is not a guess", empty.body.ok, false);

    const batch = await post({ action: "unlock", codes: ["dissendium", "nope"] });
    check("a batch returns only what matched", batch.body.found.length, 1);

    console.log("\n--- the trails that link it back to the map ---");
    // t-dangling runs from a public room (r039) into a held one (r062). The
    // public GET drops it; unlocking has to give it back, or the passage
    // arrives with no way into it.
    check("a linking trail comes back too",
        right.body.found[0].paths.map(p => p.id).sort(), ["t-dangling", "t-secret"]);
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
        cross.body.found[0].paths.some(p => p.id === "t-cross"), false);
    const both = await post({ action: "unlock", codes: ["dissendium", "aparecium"] }, { "client-ip": "6.6.6.6" });
    check("...and arrives once both secrets are open",
        both.body.found.some(f => f.paths.some(p => p.id === "t-cross")), true);

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

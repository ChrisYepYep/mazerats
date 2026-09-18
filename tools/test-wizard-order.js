/* The running order of a revealed passage, pulled straight out of
   js/wizard.js and js/admin-wizard.js and exercised directly.

   Worth testing rather than eyeballing because the two halves have to agree:
   the editor decides an order and stores it, and the page has to draw in that
   order — including for the trails that were never in the list, which the
   endpoint returns because they merely touch a revealed room.

     node tools/test-wizard-order.js
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function grab(file, name) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    const start = src.indexOf(`    function ${name}(`);
    if (start === -1) throw new Error(`${name} not found in ${file}`);
    let depth = 0;
    for (let j = src.indexOf("{", start); j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") { depth--; if (!depth) return src.slice(start, j + 1); }
    }
    throw new Error(`unbalanced ${name}`);
}

const revealOrder = new Function(
    grab("js/wizard.js", "revealOrder") + "\nreturn revealOrder;")();
const seqFns = new Function(
    grab("js/admin-wizard.js", "secretSequence") + "\n" +
    grab("js/admin-wizard.js", "setSecretSequence") +
    "\nreturn { secretSequence, setSecretSequence };")();
const { secretSequence, setSecretSequence } = seqFns;

let failures = 0;
function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
    if (!ok) console.log(`         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);
}

const flat = order => order.map(e => `${e.kind}:${e.id}`);

// The witch passage, as the endpoint hands it over: three rooms, two listed
// trails, and two linking trails that were never in anybody's list.
const found = {
    secret: { id: "witch", sequence: null },
    rooms: [{ id: "r062" }, { id: "r063" }, { id: "r064" }],
    paths: [
        { id: "c065", from: "r062", to: "r063" },
        { id: "c066", from: "r063", to: "r064" },
        { id: "c064", from: "r061", to: "r062" },   // linking: in from Gunhilda
        { id: "c067", from: "r064", to: "r007" }    // linking: out to Honeydukes
    ]
};

console.log("\n--- no stored order: the way it always played ---");
check("every trail, then every name",
    flat(revealOrder(found)),
    ["path:c065", "path:c066", "path:c064", "path:c067",
        "room:r062", "room:r063", "room:r064"]);

console.log("\n--- a stored order ---");
const arranged = {
    ...found,
    secret: {
        id: "witch",
        sequence: ["path:c065", "room:r062", "path:c066", "room:r063", "room:r064"]
    }
};
check("listed entries play in the order given, linking trails slotted in front of the room they reach",
    flat(revealOrder(arranged)),
    // c064 arrives at r062, so it is walked immediately before that name;
    // c067 leaves r064, so it is walked before that one.
    ["path:c065", "path:c064", "room:r062", "path:c066", "room:r063",
        "path:c067", "room:r064"]);

console.log("\n--- the order and the contents disagreeing ---");
const stale = {
    ...found,
    secret: { id: "witch", sequence: ["room:r063", "path:c065", "room:r999", "path:c999"] }
};
check("entries naming records that are not there are dropped",
    flat(revealOrder(stale)).filter(e => /999/.test(e)), []);
check("records the order forgot are still drawn, at the end",
    flat(revealOrder(stale)).slice(-2).sort(), ["room:r062", "room:r064"]);

console.log("\n--- the editor's side ---");
const secret = { rooms: ["r062", "r063"], paths: ["c065"], sequence: null };
check("no sequence falls back to trails then rooms",
    secretSequence(secret), ["path:c065", "room:r062", "room:r063"]);

secret.sequence = ["room:r063", "path:c065", "room:r062"];
check("a stored order is honoured",
    secretSequence(secret), ["room:r063", "path:c065", "room:r062"]);

secret.rooms.push("r064");
check("something added since is appended rather than lost",
    secretSequence(secret), ["room:r063", "path:c065", "room:r062", "room:r064"]);

secret.rooms = secret.rooms.filter(id => id !== "r063");
check("something removed since drops out of the order",
    secretSequence(secret), ["path:c065", "room:r062", "room:r064"]);

setSecretSequence(secret, ["room:r064", "path:c065", "room:r062"]);
check("writing an order rewrites the membership arrays to match",
    [secret.rooms, secret.paths], [["r064", "r062"], ["c065"]]);
check("...and round-trips", secretSequence(secret),
    ["room:r064", "path:c065", "room:r062"]);

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);

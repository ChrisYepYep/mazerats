/* Adds a search box to the furni hand, and the fix that stops its buttons
 * being stranded on a room change.
 *
 * WHAT IT DOES. A small field under the Close button. Type a furni name, press
 * Enter, and the hand shows the matching furni — all of it, wherever it was in
 * the inventory — paged through the same nine slots with the same arrows.
 * Emptying the box, or clicking the trash icon, goes back to the normal hand.
 *
 * WHY IT HAS TO INDEX FIRST. The client only ever holds ONE page of the hand —
 * updateStripItems wipes pItemList and refills it from each STRIPINFO, so at
 * any moment it knows about at most nine items. pTotalCount is just a number.
 * There is no client-side list of the inventory and no server message that
 * searches one. So a search starts by walking the hand from its first page and
 * indexing what comes back, keyed by stripId; filtering happens over that.
 *
 * The walk is strictly serialised — one GETSTRIP per reply, exactly what
 * holding down the next-page arrow does — and it ends when the server stops
 * marking a next page available. The expensive part is not the requests, it is
 * that every page that arrives re-renders nine preview images, so the walk
 * hooks into Refresh (which handle_stripinfo already calls once per page) and
 * returns before the redraw for pages it is only indexing.
 *
 * HOW THE RESULTS ARE SHOWN. By loading one page of them INTO pItemList and
 * letting the hand draw itself exactly as it always does. Same sprites, same
 * nine slots, same arrows; only the source of the nine items changes. Paging
 * through results costs no server traffic at all.
 *
 * WHAT IS ADDED, all inside Container Hand Class:
 *
 *     construct              the search properties initialised
 *     setHandButtonsVisible  the pAnimMode guard (the room-change fix)
 *     eventProcHandButtons   rewritten: Enter, the trash icon, local paging
 *     Refresh                rewritten: drives the index walk
 *     sendStrip              new — the one place that talks to the server
 *     startHandSearch        new
 *     indexCurrentPage       new
 *     finishHandSearch       new
 *     applySearchPage        new
 *     exitHandSearch         new
 *     itemMatchesSearch      new
 *
 * plus five elements in the habbo_hand_buttons.window layout member.
 *
 * HOW IT IS BUILT. Nothing here hand-writes bytes. lingo-script.js takes the
 * script apart and puts it back — verified by rebuilding all 1052 live scripts
 * in the client byte for byte — and lingo-assemble.js encodes instructions,
 * verified by re-encoding all 908,549 instructions in the client byte for
 * byte. The call sequences are copied from handlers that already do the same
 * thing: rowMatchesSearch in Furni Chooser Class for the word matching, and
 * this class's own eventProcHandButtons for the GETSTRIP calls.
 *
 * Container Hand Class and Furni Chooser Class share a name table (both are in
 * the context whose Lnam is 11830), so name indices lifted from one resolve in
 * the other. Literal indices do NOT — those are per script, and are resolved
 * by name here.
 *
 *   node tools/add-hand-search.js                 apply
 *   node tools/add-hand-search.js --dry-run       report, write nothing
 *   node tools/add-hand-search.js --restore       put the original back
 *
 * The client folder comes from HABBO_CLIENT, or --client <dir>.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const { parse, build, R, HANDLER_REC } = require("./lingo-script.js");
const { assemble } = require("./lingo-assemble.js");
const { disassemble } = require("./lingo-decompile.js");

const CAST = "hh_room.cct";
const CLASS_HANDLERS = ["setHandButtonsVisible", "isOpen", "Refresh", "eventProcHandButtons"];
/* Nothing outside the hand class is touched any more. The call that used to
   be appended to handle_stripinfo fed a staleness check that compared strip
   ENTRIES against the server's count of FURNI — a stack is one entry and many
   furni, so the two never agreed and the check wiped the index on every page. */
const WINDOW_MEMBER = "habbo_hand_buttons.window";

const NEW_NAMES = [
    "pSearchTerm", "pSearchScan", "pSearchPagesLeft", "pSearchIndex",
    "pSearchResults", "pSearchPage", "pSearchActive",
    "sendStrip", "startHandSearch", "indexCurrentPage", "finishHandSearch",
    "applySearchPage", "exitHandSearch", "itemMatchesSearch", "continueHandSearch",
    "startHandIndex", "restoreHandView", "pIndexReady", "pSearchPending",
    "pIndexBlocked", "pWalkPaused", "resumeHandIndex",
    "pWalkAwaiting", "pWalkInterval", "retryHandSearch",
    "refilterSearch", "voidp", "integerp", "deleteProp",
    "pLastTotal", "pWipes", "traceSearch",
];
const NEW_PROPERTIES = [
    "pSearchTerm", "pSearchScan", "pSearchPagesLeft", "pSearchIndex",
    "pSearchResults", "pSearchPage", "pSearchActive", "pIndexReady", "pSearchPending",
    "pIndexBlocked", "pWalkPaused", "pWalkAwaiting", "pWalkInterval",
    "pLastTotal", "pWipes",
];
const NEW_HANDLERS = [
    "sendStrip", "startHandSearch", "indexCurrentPage", "finishHandSearch",
    "applySearchPage", "exitHandSearch", "itemMatchesSearch", "continueHandSearch",
    "startHandIndex", "restoreHandView", "resumeHandIndex", "retryHandSearch",
    "refilterSearch", "traceSearch",
];
/* A runaway guard only — the walk really ends when the server stops setting
   the next-page button active. 200 pages is 1800 items. */
const MAX_SEARCH_PAGES = 200;
/* How long to wait between asking for pages. 100ms was ignored by the server
   outright; a second worked. 400 is the middle of that, and it is the number
   to raise first if the walk ever stalls again. */
/* Where the walk starts. It doubles itself whenever a request is dropped,
   so this is an opening bid rather than a setting. */
const PAGE_INTERVAL_MS = 150;
/* No page within this long means the request was ignored. */
const RETRY_AFTER_MS = 700;
/* However slow it has to get, it stops getting slower here. */
const MAX_PAGE_INTERVAL_MS = 2000;
/* How long after the player's last click before the walk picks itself back up.
   Long enough that paging through several pages does not fight it. */
const RESUME_AFTER_MS = 1200;
const NEW_LITERALS = ["hand_search_field", "hand_search_clear", "\r", "hand_search_timer"];

/* vectorPos is 0xffff on every handler in the client, and stack heights run to
   1025, so 32 is unremarkable and well above anything here. The two words at
   @30 and @34 are the handler's position in the original source — a character
   offset and a line number, both climbing steadily through a script — and @34
   is non-zero on all 13497 handlers, so new handlers continue the sequence
   rather than sitting at an value the compiler never emits. */
const NEW_RECORD = { vectorPos: 0xffff, stackHeight: 32 };

/* THE LINE BLOCK, and why an empty one is not an option.
 *
 * Every handler carries one, and it is a list of single bytes: how many
 * bytecode bytes belong to each successive source line. They sum to
 * codeLength - 1 on every handler measured — isOpen is 13 bytes of code with a
 * single line byte of 12; close is 52 bytes with 00 12 06 08 0c 07 00, which
 * is 51; construct is 183 with twenty-two bytes summing to 182.
 *
 * Only 2 of the client's 13497 handlers have an empty block, and the first
 * build of this feature gave one to all seven new handlers. Director then took
 * an access violation inside DIRAPI.dll the moment one of them ran, which is
 * what walking a line table off its end looks like.
 *
 * A block generated here describes the whole handler as one long source line.
 * That loses nothing at runtime — it is debug information — and it is
 * structurally what the compiler would have produced for a one-line handler.
 */
function lineBlockFor(codeLength) {
    let remaining = Math.max(0, codeLength - 1);
    const out = [];
    do {
        const n = Math.min(255, remaining);
        out.push(n);
        remaining -= n;
    } while (remaining > 0);
    return Buffer.from(out);
}

/* ---- varints and container ---------------------------------------------- */

function readVint(b, p) {
    let v = 0, n, start = p;
    do { n = b[p++]; v = (v << 7) | (n & 0x7f); } while (n & 0x80);
    return { value: v, raw: b.subarray(start, p), end: p };
}

function writeVint(v) {
    if (v === 0) return Buffer.from([0]);
    const groups = [];
    let x = v >>> 0;
    while (x > 0) { groups.unshift(x & 0x7f); x = Math.floor(x / 128); }
    for (let i = 0; i < groups.length - 1; i++) groups[i] |= 0x80;
    return Buffer.from(groups);
}

function openContainer(file) {
    const b = fs.readFileSync(file);
    const magic = b.toString("latin1", 0, 4);
    const big = magic === "RIFX";
    if (!big && magic !== "XFIR") throw new Error(`${file}: not an XFIR/RIFX container`);
    const rev = (s) => s.split("").reverse().join("");
    const tagOf = (s) => (big ? s : rev(s));

    let p = 12, abmp = null, dataStart = null;
    while (p < b.length) {
        const tag = tagOf(b.toString("latin1", p, p + 4));
        const tagAt = p;
        p += 4;
        if (tag === "Fver" || tag === "Fcdr") { const n = readVint(b, p); p = n.end + n.value; continue; }
        if (tag === "ABMP") {
            const len = readVint(b, p);
            const end = len.end + len.value;
            const ctype = readVint(b, len.end);
            const decomp = readVint(b, ctype.end);
            abmp = { tagAt, sectionEnd: end, ctype: ctype.value, map: zlib.inflateSync(b.subarray(decomp.end, end)) };
            p = end;
            continue;
        }
        if (tag === "FGEI") { const z = readVint(b, p); dataStart = z.end; break; }
        break;
    }
    if (!abmp || dataStart === null) throw new Error(`${file}: no ABMP/FGEI`);

    const m = abmp.map;
    let q = 0;
    const h1 = readVint(m, q); q = h1.end;
    const h2 = readVint(m, q); q = h2.end;
    const cnt = readVint(m, q); q = cnt.end;
    const res = [];
    for (let i = 0; i < cnt.value; i++) {
        const id = readVint(m, q); q = id.end;
        const off = readVint(m, q); q = off.end;
        const comp = readVint(m, q); q = comp.end;
        const dec = readVint(m, q); q = dec.end;
        const ct = readVint(m, q); q = ct.end;
        const tag = tagOf(m.toString("latin1", q, q + 4));
        const tagBytes = m.subarray(q, q + 4); q += 4;
        res.push({ id, off, comp, dec, ct, tag, tagBytes });
    }
    return { b, big, abmp, dataStart, header: [h1, h2, cnt], res, mapTail: m.subarray(q) };
}

function buildMap(cast) {
    // the resource count is a header field, and adding a resource changes it
    const parts = cast.header.map(h => (h.changed === undefined ? h.raw : writeVint(h.changed)));
    for (const e of cast.res) {
        for (const f of [e.id, e.off, e.comp, e.dec, e.ct]) {
            parts.push(f.changed === undefined ? f.raw : writeVint(f.changed));
        }
        parts.push(e.tagBytes);
    }
    parts.push(cast.mapTail);
    return Buffer.concat(parts);
}

/* Re-lay the data region, substituting payloads for resources that changed.
   Walking the original linearly and copying the bytes between resources keeps
   any padding exactly where it was, rather than repacking the file. */
function rebuildData(cast, replacements) {
    const stored = cast.res.filter(e => e.off.value >= 0).sort((a, b) => a.off.value - b.off.value);
    const old = cast.b.subarray(cast.dataStart);
    const parts = [];
    let cursor = 0, delta = 0;
    for (const e of stored) {
        if (e.off.value > cursor) parts.push(old.subarray(cursor, e.off.value));
        const payload = replacements.get(e.id.value);
        const original = old.subarray(e.off.value, e.off.value + e.comp.value);
        e.off.changed = e.off.value + delta;
        if (payload) {
            parts.push(payload);
            delta += payload.length - e.comp.value;
            e.comp.changed = payload.length;
        } else {
            parts.push(original);
        }
        cursor = e.off.value + e.comp.value;
    }
    if (cursor < old.length) parts.push(old.subarray(cursor));
    return Buffer.concat(parts);
}

/* ---- Lnam --------------------------------------------------------------- */

/* The name table is shared by all 152 scripts in the context, so names are
   only ever APPENDED — every compiled handler indexes into it positionally and
   inserting anywhere else would repoint all of them. Header: @8 and @12 hold
   the payload length (chunk minus the 20-byte header), @16 the names offset,
   @18 the count. */
function readNames(buf) {
    const off = buf.readUInt16BE(16), count = buf.readUInt16BE(18);
    const names = [];
    let p = off;
    for (let i = 0; i < count; i++) { const n = buf[p++]; names.push(buf.toString("latin1", p, p + n)); p += n; }
    return names;
}

function writeNames(buf, names) {
    const off = buf.readUInt16BE(16);
    const parts = [Buffer.from(buf.subarray(0, off))];
    for (const n of names) {
        const s = Buffer.from(n, "latin1");
        if (s.length > 255) throw new Error(`name too long: ${n}`);
        parts.push(Buffer.from([s.length]), s);
    }
    const out = Buffer.concat(parts);
    out.writeUInt16BE(names.length, 18);
    out.writeUInt32BE(out.length - off, 8);
    out.writeUInt32BE(out.length - off, 12);
    return out;
}

/* ---- the window layout -------------------------------------------------- */

/* One bar, 100 wide, ending flush with the buttons at 447, sitting two pixels
   higher than it did. The clear icon is now INSIDE the bar rather than beside
   it — the border art runs the whole width and the icon sits on top of it, with
   a one-pixel rule dividing it from the typing area:

       347 |6| ------------ text ------------ |rule| [X] |6| 447

   The rule is shadow.pixel, the same one-pixel member the buttons and the
   window's width definer are built from, drawn solid rather than invisible. */
/* THE SEARCH ROW, on the buttons' own row and to the left of them.
 *
 * SEVENTEEN TALL, NOT TWENTY, and the difference is not what the layout
 * says. The three buttons declare #height: 20, but they also carry
 * #fixedsize: 0, and #model: 5 resolves to button5.element, which sizes
 * itself to its text with #boxType: #adjust and #marginV: 3. Its art —
 * button.e.left/middle.active — is 6x17 and 1x17. So a 9pt line plus three
 * above and below paints SEVENTEEN, and the declared 20 is only a bounding
 * box. Matching the declared height made the bar three pixels taller than
 * the buttons beside it, which is what read as chunky and broken.
 *
 * field.left/middle/right is 6x17 / 1x17 / 6x17 — the same height as the
 * button art, and the same rounded box the furni chooser's search uses.
 *
 * THE RIGHT-HAND CAP AND THE X OVERLAP, which is how the chooser does it and
 * not how either of my earlier attempts did.
 *
 *   chooser:  middle ends 156 | right cap 156..162 | trash_icon 146..165
 *
 * The icon is laid ON TOP of the cap and hangs three pixels past it. So the
 * rounded end comes from the cap, showing THROUGH the icon's transparent
 * surround, and the icon only contributes its glyph. Putting the cap after
 * the icon left a stub ("leftover to the right of the X"); dropping the cap
 * left the bar ending square with the icon's own edges closing it ("its own
 * borked border", "white square corners"). Overlapped, neither happens.
 *
 * THE CLEAR CONTROL IS TEXT, NOT ART. Three bitmaps failed three different
 * ways, and each failure was the same cause: every candidate carries an
 * opaque background matched to the UI it was drawn for, and the hand's
 * window has nothing behind it but the room. trash_icon is white-backed for
 * the furni chooser — overlapping the cap it hung white corners into the
 * room, inside the bar it showed the light block meant to sit over the cap.
 * sora.control.close is the Sora tab's X, a light glyph knocked out of a
 * DARK square, so matte could not lift it either: the square IS the drawing.
 *
 * A letter has no background to go wrong. The client ships 364 clickable
 * text elements — #type "text", #editable 0, #model #image, a finger cursor
 * — used as links, so this is its own idiom rather than an invention, and
 * they raise events by id exactly as a piece does.
 *
 * Its text is set from code in Refresh rather than through #key, because
 * #key is a localisation lookup and what it returns for a key that does not
 * exist is not worth another round of guessing.
 *
 *   139 |6|---- text (70) ----| |‖| [x] |6| 239      arrows at 247
 */
const SEARCH_ELEMENTS = [
    '[#member: "field.left", #media: #bitmap, #locH: 139, #locV: 0, #ink: 36, #blend: 100, #width: 6, #height: 17, #palette: "interface palette", #type: "piece", #id: "hand_search_border_left"]',
    '[#member: "field.middle", #media: #bitmap, #locH: 145, #locV: 0, #ink: 36, #blend: 100, #width: 88, #height: 17, #palette: "interface palette", #type: "piece", #id: "hand_search_border_middle"]',
    '[#member: "field.right", #media: #bitmap, #locH: 233, #locV: 0, #ink: 36, #blend: 100, #width: 6, #height: 17, #palette: "interface palette", #type: "piece", #id: "hand_search_border_right"]',
    '[#member: "null", #media: #field, #locH: 146, #locV: 3, #ink: 36, #blend: 100, #width: 66, #height: 10, #editable: 1, #autoTab: 0, #boxType: #limit, #wordWrap: 0, #alignment: "left", #font: "V", #fontStyle: "plain", #fontSize: 9, #lineHeight: 11, #type: "text", #id: "hand_search_field", #model: #edit, #key: ""]',
    '[#member: "shadow.pixel", #media: #bitmap, #locH: 216, #locV: 3, #ink: 0, #blend: 100, #width: 1, #height: 11, #palette: "interface palette", #type: "piece", #id: "hand_search_divider"]',
    /* #model #edit, matching hand_search_field, because that is the only text
       element in this window PROVEN to keep its colour.

       The two models are different classes. #image (fuse_client script 3852)
       renders through its own pFontData and buffer — prepare puts #txtColor
       into that font data and setText re-renders from it, and something in
       that sequence left the letter unstyled until a click re-ran it, which
       is exactly "black only when clicked". #edit (script 3880) sets
       me.pMember.color from #txtColor and setText writes straight to the
       member. The search label goes through #edit and survives dozens of
       setText calls still black, so the X now goes the same way.

       #key carries the letter as well as the runtime setText, so it is
       present when the element is first prepared rather than only afterwards.

       A capital X on purpose: a lowercase x has no ascender, so its ink sits
       low in an 11px line box, while a capital fills the cap height. */
    '[#member: "null", #media: #field, #locH: 220, #locV: 2, #ink: 36, #blend: 100, #width: 10, #height: 11, #editable: 0, #autoTab: 0, #boxType: #limit, #wordWrap: 0, #alignment: "center", #font: "V", #fontStyle: "bold", #fontSize: 9, #lineHeight: 11, #color: "#000000", #txtColor: "#000000", #type: "text", #id: "hand_search_clear", #model: #edit, #key: "X", #cursor: "cursor.finger"]',
];

function rewriteWindowText(text) {
    if (text.indexOf("hand_search_field") >= 0) return null;         // already done
    const closeTag = text.lastIndexOf("</elements>");
    if (closeTag < 0) throw new Error("no </elements> in the layout");
    // Match the indentation the existing element lines use.
    const added = SEARCH_ELEMENTS.map(e => "\r\t\t" + e).join("");
    let out = text.slice(0, closeTag).replace(/\s*$/, "") + added + "\r\t" + text.slice(closeTag);
    /* The rect stays as it was. It grew to 42 when the bar needed a second
       row beneath the buttons; on their row it needs no extra height, and the
       window is back to the one the client ships. Still checked, because
       every position in SEARCH_ELEMENTS assumes this exact 447-wide layout. */
    if (out.indexOf("[0, 0, 447, 26]") < 0) throw new Error("window rect is not the one this was written for");
    return out;
}

/* ---- the code ----------------------------------------------------------- */

/* --probe builds the smallest thing that can answer the question the crash
 * poses, because every test of a crashing build costs a launch.
 *
 * It adds the search row to the window and NOTHING else: no new handlers, no
 * new properties, no new names. eventProcHandButtons gains one branch — Enter
 * in the field writes "ok" into the field and returns.
 *
 *     "ok" appears  -> the window, the field, the keyDown route and the
 *                      rewritten handler are all fine, and the crash is in
 *                      what the full build ADDS (handlers, properties, names)
 *     still crashes -> the crash is in the search field itself, and none of
 *                      the Lingo written for this feature is implicated
 */
function buildProbeHandler(script, N, L) {
    const P = (n) => ["getProp", N(n)];
    const ARG = (i) => ["getParam", i];
    const LIT = (s) => ["pushCons", L(s)];
    const SYM = (n) => ["pushSymb", N(n)];
    const ME = ARG(0);
    const call = (n, argc) => [["pushArgList", argc], ["extCall", N(n)]];
    const callv = (n, argc) => [["pushArgListNoRet", argc], ["extCall", N(n)]];
    const builtin = (n, argc) => [["pushArgList", argc], ["theBuiltin", N(n)]];
    const mcall = (n, argc) => [["pushArgList", argc], ["objCall", N(n)]];
    const mcallv = (n, argc) => [["pushArgListNoRet", argc], ["objCall", N(n)]];
    const RET = (...e) => [...e, ["pushArgListNoRet", 1], ["extCall", N("return")]];

    const roomConnection = () => [
        SYM("room"), ...call("getThread", 1),
        ...mcall("getComponent", 1), ...mcall("getRoomConnection", 1),
    ];

    return {
        eventProcHandButtons: {
            args: ["me", "tEvent", "tSprID", "tParam"],
            locals: [],
            code: [
                ARG(1), SYM("keyDown"), ["eq"], ["jmpIfZ", { label: "notKey" }],
                ARG(2), LIT("hand_search_field"), ["eq"], ["jmpIfZ", { label: "keyDone" }],
                ...builtin("key", 0), LIT("\r"), ["eq"], ["jmpIfZ", { label: "keyDone" }],
                P("pHandButtonsWnd"), ...call("getWindow", 1),
                LIT("hand_search_field"), ...mcall("getElement", 2),
                LIT("ok"), ...mcallv("setText", 2),
                ...RET(["pushInt8", 1]),
                ["label", "keyDone"],
                ...RET(["pushZero"]),
                ["label", "notKey"],
                ARG(1), SYM("mouseUp"), ["ntEq"], ["jmpIfZ", { label: "isMouseUp" }],
                ...RET(["pushZero"]),
                ["label", "isMouseUp"],
                ARG(2), LIT("habbo_hand_next"), ["eq"], ["jmpIfZ", { label: "notNext" }],
                ...roomConnection(), LIT("GETSTRIP"), LIT("next"), ...mcallv("send", 3),
                ...RET(["pushInt8", 1]),
                ["label", "notNext"],
                ARG(2), LIT("habbo_hand_prev"), ["eq"], ["jmpIfZ", { label: "notPrev" }],
                ...roomConnection(), LIT("GETSTRIP"), LIT("prev"), ...mcallv("send", 3),
                ...RET(["pushInt8", 1]),
                ["label", "notPrev"],
                ARG(2), LIT("habbo_hand_close"), ["eq"], ["jmpIfZ", { label: "notClose" }],
                ME, ...mcallv("close", 1),
                ...RET(["pushInt8", 1]),
                ["label", "notClose"],
                ...RET(["pushZero"]),
                ["ret"],
            ],
        },
    };
}

function buildHandlers(script, N, L, diag, diag2, diag3) {
    /* Shorthands that keep the instruction lists readable. `me` is always
       argument 0, which is how every method in this class is compiled. */
    const P = (n) => ["getProp", N(n)];
    const SP = (n) => ["setProp", N(n)];
    const ARG = (i) => ["getParam", i];
    const LGET = (i) => ["getLocal", i];
    const LSET = (i) => ["setLocal", i];
    const LIT = (s) => ["pushCons", L(s)];
    const SYM = (n) => ["pushSymb", N(n)];
    // pushInt8 is signed, so anything past 127 has to be a 16-bit push.
    const INT = (v) => (v <= 127 ? ["pushInt8", v] : ["pushInt16", v]);
    const ME = ARG(0);
    // A call whose value is wanted, and one made for its effect.
    const call = (n, argc) => [["pushArgList", argc], ["extCall", N(n)]];
    /* Director built-ins are NOT global handlers: the client calls key(),
       stageRight() and friends through theBuiltin, and an extCall for one of
       those resolves to nothing. That is what left the Enter key dead. */
    const builtin = (n, argc) => [["pushArgList", argc], ["theBuiltin", N(n)]];
    const EMPTY_PROPLIST = [["pushArgList", 0], ["pushPropList"]];
    const EMPTY_LIST = [["pushArgList", 0], ["pushList"]];
    const callv = (n, argc) => [["pushArgListNoRet", argc], ["extCall", N(n)]];
    const mcall = (n, argc) => [["pushArgList", argc], ["objCall", N(n)]];
    const mcallv = (n, argc) => [["pushArgListNoRet", argc], ["objCall", N(n)]];
    const RET = (...expr) => [...expr, ...callv("return", 1)];
    const RET0 = () => RET(["pushZero"]);
    const RET1 = () => RET(INT(1));

    // getThread(#room).getComponent().getRoomConnection() — copied from the
    // class's own eventProcHandButtons.
    const roomConnection = () => [
        SYM("room"), ...call("getThread", 1),
        ...mcall("getComponent", 1),
        ...mcall("getRoomConnection", 1),
    ];

    const handlers = {};

    /* --- itemMatchesSearch me, tItem, tTerm -----------------------------
       Every word of the term has to appear in the item's name or class, which
       is how rowMatchesSearch treats a search term. `contains` is case
       insensitive, so nothing is folded first. */
    handlers.itemMatchesSearch = {
        args: ["me", "tItem", "tTerm"],
        locals: ["tText", "i", "tWord"],
        code: [
            ARG(1), SYM("name"), ...mcall("getAt", 2), ...call("string", 1),
            ARG(1), SYM("class"), ...mcall("getAt", 2), ...call("string", 1),
            ["joinPadStr"], LSET(0),
            INT(1), LSET(1),
            ["label", "loop"],
            LGET(1), ARG(2), SYM("word"), ...mcall("count", 2), ["ltEq"],
            ["jmpIfZ", { label: "matched" }],
            ARG(2), SYM("word"), LGET(1), ...mcall("getProp", 3), ...call("string", 1), LSET(2),
            LGET(2), LIT(""), ["ntEq"], ["jmpIfZ", { label: "next" }],
            LGET(0), LGET(2), ["containsStr"], ["not"], ["jmpIfZ", { label: "next" }],
            ...RET0(),
            ["label", "next"],
            INT(1), LGET(1), ["add"], LSET(1),
            ["endRepeat", { label: "loop" }],
            ["label", "matched"],
            ...RET1(),
            ["ret"],
        ],
    };

    /* --- sendStrip me, tWhich --------------------------------------------
       The one place that talks to the server, so the walk is easy to audit. */
    handlers.sendStrip = {
        args: ["me", "tWhich"],
        locals: ["tConnection"],
        code: [
            ...roomConnection(), LSET(0),
            LGET(0), ["pushZero"], ["eq"], ["jmpIfZ", { label: "have" }],
            /* Looking the connection up from inside a network message handler
               is the thing under suspicion, so --diag says so out loud. */
            ...(diag ? [
                P("pHandButtonsWnd"), ...call("getWindow", 1),
                LIT("hand_search_field"), ...mcall("getElement", 2),
                LIT("noconn"), ...mcallv("setText", 2),
            ] : []),
            ...RET0(),
            ["label", "have"],
            ...RET(LGET(0), LIT("GETSTRIP"), ARG(1), ...mcall("send", 3)),
            ["ret"],
        ],
    };

    /* --- retryHandSearch me -----------------------------------------------
       The page never came, so the request was ignored for being too soon.
       Halve the pace and ask again. */
    handlers.retryHandSearch = {
        args: ["me"],
        locals: [],
        code: [
            P("pSearchScan"), ["jmpIfZ", { label: "bail" }],
            P("pWalkAwaiting"), ["jmpIfZ", { label: "bail" }],
            P("pWalkPaused"), ["jmpIfZ", { label: "goSlower" }],
            ...RET0(),
            ["label", "goSlower"],
            P("pWalkInterval"), INT(2), ["mul"], SP("pWalkInterval"),
            P("pWalkInterval"), INT(MAX_PAGE_INTERVAL_MS), ["gt"],
            ["jmpIfZ", { label: "notTooSlow" }],
            INT(MAX_PAGE_INTERVAL_MS), SP("pWalkInterval"),
            ["label", "notTooSlow"],
            ...RET(ME, ...mcall("continueHandSearch", 1)),
            ["label", "bail"],
            ...RET0(),
            ["ret"],
        ],
    };

    /* --- resumeHandIndex me -----------------------------------------------
       Picks the walk back up from wherever the player left the cursor. That is
       fine from any position: the index is keyed by stripId and the walk ends
       when a page adds nothing new, so it closes the loop whatever order the
       pages arrive in. */
    handlers.resumeHandIndex = {
        args: ["me"],
        locals: [],
        code: [
            P("pSearchScan"), ["jmpIfZ", { label: "bail" }],
            ["pushZero"], SP("pWalkPaused"),
            ...RET(ME, ...mcall("continueHandSearch", 1)),
            ["label", "bail"],
            ...RET0(),
            ["ret"],
        ],
    };

    /* --- startHandIndex me ------------------------------------------------
       Begins a walk from wherever the strip currently is. It does not need to
       start at page one: the index is keyed by stripId and the walk ends when
       a page adds nothing new, so going round from any point covers the lot. */
    handlers.startHandIndex = {
        args: ["me"],
        locals: [],
        code: [
            ...EMPTY_PROPLIST, SP("pSearchIndex"),
            INT(1), SP("pSearchScan"),
            ["pushZero"], SP("pWalkAwaiting"),
            INT(PAGE_INTERVAL_MS), SP("pWalkInterval"),
            INT(MAX_SEARCH_PAGES), SP("pSearchPagesLeft"),
            LIT("hand_search_timer"), P("pWalkInterval"), SYM("continueHandSearch"),
            ME, ...mcall("getID", 1), ["pushZero"], INT(1),
            ...callv("createTimeout", 6),
            ...RET1(),
            ["ret"],
        ],
    };

    /* --- restoreHandView me -----------------------------------------------
       A background walk leaves the server's cursor somewhere in the middle of
       the inventory, so when one finishes with no search waiting the first
       page is asked for again and the hand goes back to where the player left
       it. */
    handlers.restoreHandView = {
        args: ["me"],
        locals: [],
        code: [
            ...RET(ME, LIT("new"), ...mcall("sendStrip", 2)),
            ["ret"],
        ],
    };

    /* --- continueHandSearch me --------------------------------------------
       The next page is asked for from a timer, not from inside Refresh.

       A GETSTRIP issued while the client is still handling the previous reply
       goes out and returns cleanly, and the answer never arrives — measured:
       the walk stalls with the request sent, and each arrow click (a request
       from a mouse event instead) advances it by exactly one page. So every
       request after the first is handed to me.delay, which fires it from a
       timeout once the message handler has unwound.

       pSearchScan is re-checked because the timer can outlive the search: the
       trash icon clears it, and a stale tick must not restart the walk. */
    handlers.continueHandSearch = {
        args: ["me"],
        locals: [],
        code: [
            P("pSearchScan"), ["jmpIfZ", { label: "bail" }],
            P("pWalkPaused"), ["jmpIfZ", { label: "notPaused" }],
            ...RET0(),
            ["label", "notPaused"],
            ...(diag ? [
                P("pHandButtonsWnd"), ...call("getWindow", 1),
                LIT("hand_search_field"), ...mcall("getElement", 2),
                P("pSearchIndex"), ["getObjProp", N("count")], ...call("string", 1),
                LIT("t"), ["joinStr"],
                ...mcallv("setText", 2),
            ] : []),
            /* A dropped request is answered by nothing, so every request gets
               a watchdog. If the page has not arrived by the time it fires,
               the walk slows down and asks again. */
            INT(1), SP("pWalkAwaiting"),
            LIT("hand_search_retry"), ...call("timeoutExists", 1),
            ["jmpIfZ", { label: "noOldRetry" }],
            LIT("hand_search_retry"), ...callv("removeTimeout", 1),
            ["label", "noOldRetry"],
            LIT("hand_search_retry"), INT(RETRY_AFTER_MS), SYM("retryHandSearch"),
            ME, ...mcall("getID", 1), ["pushZero"], INT(1),
            ...callv("createTimeout", 6),
            ...RET(ME, LIT("next"), ...mcall("sendStrip", 2)),
            ["label", "bail"],
            ...RET0(),
            ["ret"],
        ],
    };

    /* --- startHandSearch me ----------------------------------------------
       Filtering has to see the whole hand, and the client only ever holds one
       page of it, so a search begins by walking the inventory from the first
       page and indexing what comes back. An empty box just leaves search
       mode. */
    handlers.startHandSearch = {
        args: ["me"],
        locals: ["tWndObj", "tText"],
        code: [
            P("pHandButtonsWnd"), ...call("getWindow", 1), LSET(0),
            LGET(0), ["pushZero"], ["eq"], ["jmpIfZ", { label: "haveWindow" }],
            ...RET0(),
            ["label", "haveWindow"],
            /* While a search is running the box reads "loading", which is not
               a search term. A second Enter is ignored rather than taking it
               as one. */
            P("pSearchPending"), ["jmpIfZ", { label: "notBusy" }],
            ...RET1(),
            ["label", "notBusy"],
            LGET(0), LIT("hand_search_field"), ...mcall("getElement", 2),
            ...mcall("getText", 1), ...call("string", 1), LSET(1),
            /* After a search the box reads "duck [1]", so taking it at face
               value would search for the count as well and match nothing. A
               bracket means the box is showing a result rather than something
               freshly typed, and the term already held is the one meant. */
            LGET(1), LIT("["), ["containsStr"], ["jmpIfZ", { label: "takeText" }],
            ["jmp", { label: "haveText" }],
            ["label", "takeText"],
            LGET(1), SP("pSearchTerm"),
            ["label", "haveText"],
            P("pSearchTerm"), LIT(""), ["eq"], ["jmpIfZ", { label: "haveTerm" }],
            ...RET(ME, ...mcall("exitHandSearch", 1)),
            ["label", "haveTerm"],
            /* The common case: the hand was opened a moment ago, the walk has
               already finished in the background, and filtering is immediate
               with no server traffic at all. */
            P("pIndexReady"), ["jmpIfZ", { label: "notReady" }],
            ...RET(ME, ...mcall("finishHandSearch", 1)),
            ["label", "notReady"],
            /* Otherwise wait for the walk, starting one if it is not running. */
            INT(1), SP("pSearchPending"),
            /* The walk is about to run, so say so. The match count replaces
               this when it lands. */
            LGET(0), LIT("hand_search_field"), ...mcall("getElement", 2),
            LIT("loading"), ...mcallv("setText", 2),
            /* If a walk is already running, make sure it is not sitting paused
               waiting for a resume timer the player is no longer feeding. */
            P("pSearchScan"), ["jmpIfZ", { label: "startWalk" }],
            P("pWalkPaused"), ["jmpIfZ", { label: "alreadyRunning" }],
            ["pushZero"], SP("pWalkPaused"),
            ...RET(ME, LIT("next"), ...mcall("sendStrip", 2)),
            ["label", "alreadyRunning"],
            ...RET1(),
            ["label", "startWalk"],
            ...RET(ME, ...mcall("startHandIndex", 1)),
            ["ret"],
        ],
    };

    /* --- indexCurrentPage me ----------------------------------------------
       Keyed by stripId, so a page arriving twice costs nothing. */
    handlers.indexCurrentPage = {
        args: ["me"],
        locals: ["tList", "i", "tItem"],
        code: [
            ME, SYM("list"), ...mcall("getStripItem", 2), LSET(0),
            INT(1), LSET(1),
            ["label", "loop"],
            LGET(1), LGET(0), ["getObjProp", N("count")], ["ltEq"],
            ["jmpIfZ", { label: "done" }],
            LGET(0), LGET(1), ...mcall("getAt", 2), LSET(2),
            P("pSearchIndex"), LGET(2), SYM("stripId"), ...mcall("getAt", 2),
            LGET(2), ...mcallv("setAt", 3),
            INT(1), LGET(1), ["add"], LSET(1),
            ["endRepeat", { label: "loop" }],
            ["label", "done"],
            ...RET1(),
            ["ret"],
        ],
    };

    /* --- finishHandSearch me ---------------------------------------------- */
    handlers.finishHandSearch = {
        args: ["me"],
        locals: [],
        code: [
            ["pushZero"], SP("pSearchPage"),
            INT(1), SP("pSearchActive"),
            ...RET(ME, ...mcall("refilterSearch", 1)),
            ["ret"],
        ],
    };

    /* --- traceSearch me ----------------------------------------------------
       --diag2 only. results/index/lastTotal/wipes, into the only output this
       window has. */
    handlers.traceSearch = {
        args: ["me"],
        locals: ["tWnd"],
        code: [
            P("pHandButtonsWnd"), ...call("getWindow", 1), LSET(0),
            LGET(0), ["pushZero"], ["eq"], ["jmpIfZ", { label: "haveWnd" }],
            ...RET0(),
            ["label", "haveWnd"],
            LGET(0), LIT("hand_search_field"), ...mcall("getElement", 2),
            P("pSearchResults"), ["getObjProp", N("count")], ...call("string", 1),
            LIT("/"), ["joinStr"],
            P("pSearchIndex"), ["getObjProp", N("count")], ...call("string", 1), ["joinStr"],
            LIT("/"), ["joinStr"],
            P("pLastTotal"), ...call("string", 1), ["joinStr"],
            LIT("/"), ["joinStr"],
            P("pWipes"), ...call("string", 1), ["joinStr"],
            ...mcallv("setText", 2),
            ...RET1(),
            ["ret"],
        ],
    };

    /* --- refilterSearch me ------------------------------------------------
       Everything that puts results on screen comes through here: the search
       itself, and any later change to the hand's contents. The index is the
       single source of truth, so a rebuild is always correct and never has to
       know what changed. */
    handlers.refilterSearch = {
        args: ["me"],
        locals: ["i", "tItem", "tWnd"],
        code: [
            ...EMPTY_LIST, SP("pSearchResults"),
            INT(1), LSET(0),
            ["label", "loop"],
            LGET(0), P("pSearchIndex"), ["getObjProp", N("count")], ["ltEq"],
            ["jmpIfZ", { label: "done" }],
            P("pSearchIndex"), LGET(0), ...mcall("getAt", 2), LSET(1),
            ME, LGET(1), P("pSearchTerm"), ...call("string", 1),
            ...mcall("itemMatchesSearch", 3),
            ["jmpIfZ", { label: "next" }],
            P("pSearchResults"), LGET(1), ...mcallv("add", 2),
            ["label", "next"],
            INT(1), LGET(0), ["add"], LSET(0),
            ["endRepeat", { label: "loop" }],
            ["label", "done"],
            /* Placing the last furni on a page would otherwise leave the
               player looking at nothing, so an emptied page steps back. */
            P("pSearchPage"), ["pushZero"], ["gt"], ["jmpIfZ", { label: "pageOK" }],
            P("pSearchResults"), ["getObjProp", N("count")],
            P("pSearchPage"), INT(9), ["mul"], ["ltEq"],
            ["jmpIfZ", { label: "pageOK" }],
            P("pSearchPage"), INT(1), ["sub"], SP("pSearchPage"),
            ["label", "pageOK"],
            /* The box keeps the word that was searched for and gains the match
               count — "duck [4]" — so the result reads as a result rather than
               as a bare number, and the term stays visible to edit. It tracks
               the hand: place one of the four ducks and it reads "duck [3]". */
            P("pHandButtonsWnd"), ...call("getWindow", 1), LSET(2),
            LGET(2), ["pushZero"], ["eq"], ["jmpIfZ", { label: "haveWnd" }],
            ["jmp", { label: "noWnd" }],
            ["label", "haveWnd"],
            LGET(2), LIT("hand_search_field"), ...mcall("getElement", 2),
            P("pSearchTerm"), LIT(" ["), ["joinStr"],
            P("pSearchResults"), ["getObjProp", N("count")], ...call("string", 1), ["joinStr"],
            LIT("]"), ["joinStr"],
            ...(diag3 ? [
                LIT(" "), ["joinStr"],
                P("pSearchIndex"), ["getObjProp", N("count")], ...call("string", 1), ["joinStr"],
            ] : []),
            ...mcallv("setText", 2),
            ["label", "noWnd"],
            ...(diag2 ? [ME, ...mcallv("traceSearch", 1)] : []),
            ...RET(ME, ...mcall("applySearchPage", 1)),
            ["ret"],
        ],
    };

    /* --- applySearchPage me -----------------------------------------------
       The results are shown by loading one page of them INTO pItemList and
       letting the hand draw itself exactly as it always does — same sprites,
       same nine slots, same arrows. Nothing about the look changes; only
       where the nine items came from. pTotalCount and the arrow states are
       set to match, so the buttons page through the results. */
    handlers.applySearchPage = {
        args: ["me"],
        locals: ["tFrom", "i", "tIdx", "tItem"],
        code: [
            ...EMPTY_PROPLIST, SP("pItemList"),
            P("pSearchPage"), INT(9), ["mul"], LSET(0),
            INT(1), LSET(1),
            ["label", "loop"],
            LGET(1), INT(9), ["ltEq"], ["jmpIfZ", { label: "done" }],
            LGET(0), LGET(1), ["add"], LSET(2),
            LGET(2), P("pSearchResults"), ["getObjProp", N("count")], ["ltEq"],
            ["jmpIfZ", { label: "next" }],
            P("pSearchResults"), LGET(2), ...mcall("getAt", 2), LSET(3),
            P("pItemList"), LGET(3), SYM("stripId"), ...mcall("getAt", 2),
            LGET(3), ...mcallv("setAt", 3),
            ["label", "next"],
            INT(1), LGET(1), ["add"], LSET(1),
            ["endRepeat", { label: "loop" }],
            ["label", "done"],
            P("pSearchResults"), ["getObjProp", N("count")], SP("pTotalCount"),
            P("pSearchResults"), ["getObjProp", N("count")],
            LGET(0), INT(9), ["add"], ["gt"], SP("pNextActive"),
            P("pSearchPage"), ["pushZero"], ["gt"], SP("pPrevActive"),
            ME, ...mcallv("setHandButtonsVisible", 1),
            ME, ...mcallv("hideContainerItems", 1),
            ME, ...mcallv("showContainerItems", 1),
            ...RET1(),
            ["ret"],
        ],
    };

    /* --- exitHandSearch me ------------------------------------------------
       Back to the hand the server is paging, and the box emptied. */
    handlers.exitHandSearch = {
        args: ["me"],
        locals: ["tWndObj"],
        code: [
            ["pushZero"], SP("pSearchActive"),
            ["pushZero"], SP("pSearchScan"),
            ["pushZero"], SP("pSearchPage"),
            LIT(""), SP("pSearchTerm"),
            ...EMPTY_LIST, SP("pSearchResults"),
            P("pHandButtonsWnd"), ...call("getWindow", 1), LSET(0),
            LGET(0), ["pushZero"], ["eq"], ["jmpIfZ", { label: "haveWindow" }],
            ["jmp", { label: "send" }],
            ["label", "haveWindow"],
            LGET(0), LIT("hand_search_field"), ...mcall("getElement", 2),
            LIT(""), ...mcallv("setText", 2),
            ["label", "send"],
            ...RET(ME, LIT("new"), ...mcall("sendStrip", 2)),
            ["ret"],
        ],
    };

    /* --- Refresh me -------------------------------------------------------
       handle_stripinfo calls this once for every page that arrives, which is
       what makes it the place to drive the index walk. Pages that are only
       being indexed return before the redraw, so a long hand does not
       stutter. A page arriving while results are on screen means the
       inventory changed under us, so search mode ends rather than showing a
       stale filter. */
    handlers.Refresh = {
        args: ["me"],
        locals: ["tBefore", "tWnd"],
        code: [
            P("pSearchScan"), ["jmpIfZ", { label: "notScanning" }],
            P("pAnimMode"), SYM("open"), ["eq"], ["not"], ["jmpIfZ", { label: "stillOpen" }],
            ["pushZero"], SP("pSearchScan"),
            ["jmp", { label: "draw" }],
            ["label", "stillOpen"],
            /* Every page that arrives is indexed, whoever asked for it — pages
               the player turns are free data. */
            ["pushZero"], SP("pWalkAwaiting"),
            P("pSearchIndex"), ["getObjProp", N("count")], LSET(0),
            ME, ...mcallv("indexCurrentPage", 1),
            /* Paused means this page is the player's, so draw it and leave the
               walk where it is. */
            P("pWalkPaused"), ["jmpIfZ", { label: "ourPage" }],
            ["jmp", { label: "draw" }],
            ["label", "ourPage"],
            P("pSearchPagesLeft"), INT(1), ["sub"], SP("pSearchPagesLeft"),
            /* WHEN TO STOP. Not pNextActive: handle_stripinfo sets next and
               prev to the SAME value, tTotalItemCount > tStripMax, which means
               "this hand needs more than one page" and stays true throughout.
               What ends it is a page that adds nothing new. */
            P("pSearchIndex"), ["getObjProp", N("count")], LGET(0), ["gt"],
            ["jmpIfZ", { label: "allSeen" }],
            P("pSearchPagesLeft"), ["pushZero"], ["gt"], ["jmpIfZ", { label: "allSeen" }],
            ...(diag ? [
                P("pHandButtonsWnd"), ...call("getWindow", 1),
                LIT("hand_search_field"), ...mcall("getElement", 2),
                P("pSearchIndex"), ["getObjProp", N("count")], ...call("string", 1),
                ...mcallv("setText", 2),
            ] : []),
            LIT("hand_search_timer"), P("pWalkInterval"), SYM("continueHandSearch"),
            ME, ...mcall("getID", 1), ["pushZero"], INT(1),
            ...callv("createTimeout", 6),
            ...RET1(),
            ["label", "allSeen"],
            ["pushZero"], SP("pSearchScan"),
            INT(1), SP("pIndexReady"),
            P("pSearchPending"), ["jmpIfZ", { label: "noPending" }],
            ["pushZero"], SP("pSearchPending"),
            ...RET(ME, ...mcall("finishHandSearch", 1)),
            ["label", "noPending"],
            LIT("hand_search_timer"), INT(PAGE_INTERVAL_MS), SYM("restoreHandView"),
            ME, ...mcall("getID", 1), ["pushZero"], INT(1),
            ...callv("createTimeout", 6),
            ...RET1(),
            ["label", "notScanning"],
            /* A FULL PAGE ARRIVING WHILE RESULTS ARE ON SCREEN MEANS THE HAND
               CHANGED, AND THE PAGE IS NOT ENOUGH TO KNOW WHAT CHANGED.

               Picking a furni up does not go through appendStripItem — that
               is only reached from STRIPINFO 98. A pickup sends message 101,
               and handle_stripupdated answers it with GETSTRIP "last". So the
               new furni reaches us only if it happens to sit on the page that
               comes back. When it does not, nothing here can see it: the
               index does not grow, the results do not change, and it appears
               only once the search is cleared and the pages reload. That is
               the intermittent "picked-up furni never comes back" bug.

               While a search is active the arrows page the RESULTS and never
               ask the server, so a full page arriving here can only mean the
               hand's contents moved. Index what we were sent and redraw
               immediately — that alone keeps placing correct and instant —
               then rebuild the index properly, because a page is a sample and
               this needs the whole inventory.

               So: index what we were sent, redraw from it, and mark the index
               as no longer complete. Placing stays correct and instant,
               because removeStripItem already took the item out of the index
               before this ran. A furni picked up INTO a live search may not
               appear until the search is run again — pIndexReady is now
               clear, so the next Enter rebuilds from the whole inventory and
               is guaranteed right.

               An earlier version rebuilt immediately, here, on every change.
               It was correct and it felt awful: a pause on every place and
               pickup, and the results thrown back to page one each time. A
               predictable limitation beats an unpredictable wait. */
            P("pSearchActive"), ["jmpIfZ", { label: "notFiltered" }],
            ME, ...mcallv("indexCurrentPage", 1),
            ["pushZero"], SP("pIndexReady"),
            ...RET(ME, ...mcall("refilterSearch", 1)),
            ["label", "notFiltered"],
            /* The index outlives the hand closing, so it has to be kept true
               while the hand is open rather than rebuilt afterwards. Every
               page the player is shown is folded in — free, no server traffic
               — which is how an item picked up gets into the index without a
               walk. Items leaving are handled in removeStripItem.

               There is still no background walk: asking for pages while the
               player is looking at the hand starves their clicks of the one
               request slot the server allows. The walk runs when they search. */
            P("pIndexReady"), ["jmpIfZ", { label: "draw" }],
            ME, ...mcallv("indexCurrentPage", 1),
            ["label", "draw"],
            /* The clear control's letter. Set here rather than through the
               layout's #key, which is a localisation lookup — this way what
               it shows does not depend on how a missing key resolves. Refresh
               runs on every page and on open, which is often enough to be
               reliable and rare enough to cost nothing. */
            P("pHandButtonsWnd"), ...call("getWindow", 1), LSET(1),
            LGET(1), ["pushZero"], ["eq"], ["jmpIfZ", { label: "haveWnd" }],
            ["jmp", { label: "noWnd" }],
            ["label", "haveWnd"],
            LGET(1), LIT("hand_search_clear"), ...mcall("getElement", 2),
            LIT("X"), ...mcallv("setText", 2),
            ["label", "noWnd"],
            ME, ...mcallv("hideContainerItems", 1),
            ME, ...mcallv("showContainerItems", 1),
            ...RET1(),
            ["ret"],
        ],
    };

    /* --- eventProcHandButtons me, tEvent, tSprID, tParam ------------------
       Enter in the field searches, the trash icon clears it, and while
       results are showing the arrows page through them without asking the
       server for anything. */
    handlers.eventProcHandButtons = {
        args: ["me", "tEvent", "tSprID", "tParam"],
        locals: [],
        code: [
            ARG(1), SYM("keyDown"), ["eq"], ["jmpIfZ", { label: "notKey" }],
            ARG(2), LIT("hand_search_field"), ["eq"], ["jmpIfZ", { label: "keyDone" }],
            ...builtin("key", 0), LIT("\r"), ["eq"], ["jmpIfZ", { label: "keyDone" }],
            ...RET(ME, ...mcall("startHandSearch", 1)),
            ["label", "keyDone"],
            ...RET0(),
            ["label", "notKey"],
            ARG(1), SYM("mouseUp"), ["ntEq"], ["jmpIfZ", { label: "isMouseUp" }],
            ...RET0(),
            ["label", "isMouseUp"],
            /* Step aside for the player: the walk pauses and re-arms its
               resume timer on every press, so continuous paging keeps it out
               of the way and it resumes once the clicking stops. The old
               timer has to go first — createTimeout refuses an id that is
               already registered. */
            P("pSearchScan"), ["jmpIfZ", { label: "noPause" }],
            INT(1), SP("pWalkPaused"),
            LIT("hand_search_resume"), ...call("timeoutExists", 1),
            ["jmpIfZ", { label: "noOldTimer" }],
            LIT("hand_search_resume"), ...callv("removeTimeout", 1),
            ["label", "noOldTimer"],
            LIT("hand_search_resume"), INT(RESUME_AFTER_MS), SYM("resumeHandIndex"),
            ME, ...mcall("getID", 1), ["pushZero"], INT(1),
            ...callv("createTimeout", 6),
            ["label", "noPause"],
            ARG(2), LIT("habbo_hand_next"), ["eq"], ["jmpIfZ", { label: "notNext" }],
            P("pSearchActive"), ["jmpIfZ", { label: "serverNext" }],
            P("pSearchPage"), INT(1), ["add"], SP("pSearchPage"),
            ...RET(ME, ...mcall("applySearchPage", 1)),
            ["label", "serverNext"],
            ME, LIT("next"), ...mcallv("sendStrip", 2),
            ...RET1(),
            ["label", "notNext"],
            ARG(2), LIT("habbo_hand_prev"), ["eq"], ["jmpIfZ", { label: "notPrev" }],
            P("pSearchActive"), ["jmpIfZ", { label: "serverPrev" }],
            P("pSearchPage"), ["pushZero"], ["gt"], ["jmpIfZ", { label: "atFirst" }],
            P("pSearchPage"), INT(1), ["sub"], SP("pSearchPage"),
            ["label", "atFirst"],
            ...RET(ME, ...mcall("applySearchPage", 1)),
            ["label", "serverPrev"],
            ME, LIT("prev"), ...mcallv("sendStrip", 2),
            ...RET1(),
            ["label", "notPrev"],
            ARG(2), LIT("habbo_hand_close"), ["eq"], ["jmpIfZ", { label: "notClose" }],
            ME, ...mcallv("close", 1),
            ...RET1(),
            ["label", "notClose"],
            ARG(2), LIT("hand_search_clear"), ["eq"], ["jmpIfZ", { label: "notClear" }],
            ...RET(ME, ...mcall("exitHandSearch", 1)),
            ["label", "notClear"],
            ...RET0(),
            ["ret"],
        ],
    };
    return handlers;
}

/* ---- main --------------------------------------------------------------- */

function clientDir(argv) {
    const i = argv.indexOf("--client");
    const dir = i > -1 ? argv[i + 1] : process.env.HABBO_CLIENT;
    if (!dir) { console.error("No client folder. Set HABBO_CLIENT or pass --client <dir>."); process.exit(1); }
    return dir;
}

function run(argv) {
    const dir = clientDir(argv);
    const file = path.join(dir, CAST);
    const backup = file + ".orig";
    const dryRun = argv.includes("--dry-run");
    const probe = argv.includes("--probe");
    const probe2 = argv.includes("--probe2");
    const diag = argv.includes("--diag");
    const diag2 = argv.includes("--diag2");
    const diag3 = argv.includes("--diag3");

    if (argv.includes("--restore")) {
        if (!fs.existsSync(backup)) { console.error(`No backup at ${backup}`); process.exit(1); }
        fs.copyFileSync(backup, file);
        console.log(`Restored the original ${CAST}.`);
        return;
    }

    const cast = openContainer(file);
    const ils = cast.res.find(e => e.tag === "ILS ");
    const rawILS = cast.b.subarray(cast.dataStart + ils.off.value, cast.dataStart + ils.off.value + ils.comp.value);
    const seg = Buffer.from(ils.comp.value === ils.dec.value ? rawILS : zlib.inflateSync(rawILS));

    const byId = new Map(cast.res.map(e => [e.id.value, e]));
    const bodies = new Map();
    let p = 0;
    while (p < seg.length) {
        const id = readVint(seg, p);
        const e = byId.get(id.value);
        if (!e) break;
        bodies.set(id.value, { at: id.end, len: e.dec.value, entry: e });
        p = id.end + e.dec.value;
    }

    // The context tells us which scripts are live and which name table is theirs.
    const lctxRes = cast.res.find(e => e.tag === "LctX" || e.tag === "Lctx");
    const lctxBody = bodies.get(lctxRes.id.value);
    const lb = seg.subarray(lctxBody.at, lctxBody.at + lctxBody.len);
    const lnamId = lb.readInt32BE(32);
    const liveIds = new Set();
    for (let i = 0, n = lb.readUInt32BE(8), o = lb.readUInt16BE(16); i < n; i++) {
        liveIds.add(lb.readInt32BE(o + i * 12 + 4));
    }

    const lnamBody = bodies.get(lnamId);
    const lnamBuf = Buffer.from(seg.subarray(lnamBody.at, lnamBody.at + lnamBody.len));
    const names = readNames(lnamBuf);

    // Find the script that defines the class, by the handlers it owns.
    let target = null;
    for (const e of cast.res) {
        if (e.tag !== "Lscr" || !liveIds.has(e.id.value)) continue;
        const body = bodies.get(e.id.value);
        if (!body) continue;
        const chunk = seg.subarray(body.at, body.at + body.len);
        const s = parse(chunk);
        if (!s) continue;
        const have = s.handlers.map(h => names[h.nameID]);
        if (CLASS_HANDLERS.every(n => have.includes(n))) { target = { e, body, chunk, script: s }; break; }
    }
    if (!target) throw new Error("could not find Container Hand Class");
    console.log(`${CAST}: Container Hand Class is script ${target.e.id.value}`);

    const s = target.script;
    if (s.handlers.some(h => names[h.nameID] === "startHandSearch")) {
        console.log("  already has the search feature — nothing to do");
        return;
    }

    /* Names are appended; existing indices never move. */
    const added = [];
    for (const n of (probe ? [] : NEW_NAMES)) if (!names.includes(n)) { names.push(n); added.push(n); }
    const N = (n) => {
        const i = names.indexOf(n);
        if (i < 0) throw new Error(`name not in the table: ${n}`);
        return i;
    };

    /* Literals are appended to this script's own block. A string is stored as
       a u32 length that INCLUDES its terminating NUL, then the bytes, then the
       NUL; entries start on even offsets. */
    const litIndex = new Map();
    {
        const dataOff = target.chunk.readUInt32BE(88);
        for (let i = 0; i < s.literals.length; i++) {
            const lit = s.literals[i];
            if (lit.type !== 1) continue;
            const at = lit.rel;
            const len = s.literalData.readUInt32BE(at);
            litIndex.set(s.literalData.toString("latin1", at + 4, at + 4 + Math.max(0, len - 1)), i);
        }
    }
    const extraLiteralData = [];
    let literalDataLen = s.literalData.length;
    const L = (str) => {
        if (litIndex.has(str)) return litIndex.get(str);
        if (literalDataLen & 1) { extraLiteralData.push(Buffer.alloc(1)); literalDataLen++; }
        const body = Buffer.from(str, "latin1");
        const entry = Buffer.alloc(4 + body.length + 1);
        entry.writeUInt32BE(body.length + 1, 0);
        body.copy(entry, 4);
        const rel = literalDataLen;
        extraLiteralData.push(entry);
        literalDataLen += entry.length;
        s.literals.push({ type: 1, rel });
        const idx = s.literals.length - 1;
        litIndex.set(str, idx);
        return idx;
    };
    for (const l of (probe ? ["hand_search_field", "ok", "\r"] : NEW_LITERALS)) L(l);
    if (diag) { L("/"); L("s"); L("noconn"); L("t"); }
    if (diag2) L("/");
    if (diag3) L(" ");

    /* Properties are name indices; add the three the feature needs. */
    for (const n of (probe ? [] : NEW_PROPERTIES)) {
        const i = N(n);
        if (!s.properties.includes(i)) s.properties.push(i);
    }

    const built = probe ? buildProbeHandler(s, N, L) : buildHandlers(s, N, L, diag, diag2, diag3);

    /* Everything the full build adds stays in place — all seven new handlers,
       the properties, the rewritten Refresh — but startHandSearch is replaced
       by a body that only writes into the field. If Enter then shows "ok2",
       dispatching into a new handler works and the fault is inside the real
       body; if it still dies, the fault is the call itself. */
    if (probe2) {
        built.startHandSearch = {
            args: ["me"],
            locals: [],
            code: [
                ["getProp", N("pHandButtonsWnd")], ["pushArgList", 1], ["extCall", N("getWindow")],
                ["pushCons", L("hand_search_field")], ["pushArgList", 2], ["objCall", N("getElement")],
                ["pushCons", L("ok2")], ["pushArgListNoRet", 2], ["objCall", N("setText")],
                ["pushInt8", 1], ["pushArgListNoRet", 1], ["extCall", N("return")],
                ["ret"],
            ],
        };
    }

    /* Argument and local names are indices into the same table, so any the
       client does not already use has to be appended before they resolve. */
    for (const spec of Object.values(built)) {
        for (const n of [...spec.args, ...spec.locals]) {
            if (!names.includes(n)) { names.push(n); added.push(n); }
        }
    }

    const findHandler = (name) => s.handlers.find(h => names[h.nameID] === name);
    const assembleFor = (spec) => {
        const resolveLocals = (list) => list.map(x => N(x));
        return { code: assemble(spec.code), args: resolveLocals(spec.args), locals: resolveLocals(spec.locals) };
    };

    // Prologues prepended to existing handlers: every branch inside them is
    // relative, so inserting at the front moves them all together.
    const constructPrologue = probe ? null : assemble([
        ["pushCons", L("")], ["setProp", N("pSearchTerm")],
        ["pushZero"], ["setProp", N("pSearchScan")],
        ["pushZero"], ["setProp", N("pSearchPagesLeft")],
        ["pushZero"], ["setProp", N("pIndexReady")],
        ["pushZero"], ["setProp", N("pSearchPending")],
        ["pushZero"], ["setProp", N("pIndexBlocked")],
        ["pushZero"], ["setProp", N("pWalkPaused")],
        ["pushZero"], ["setProp", N("pSearchActive")],
        ["pushZero"], ["setProp", N("pSearchPage")],
        ["pushZero"], ["setProp", N("pWalkAwaiting")],
        ["pushInt16", PAGE_INTERVAL_MS], ["setProp", N("pWalkInterval")],
        /* The index is read by removeStripItem, which can run before any
           search has ever happened, so it exists from the start. */
        ["pushArgList", 0], ["pushPropList"], ["setProp", N("pSearchIndex")],
        ["pushArgList", 0], ["pushList"], ["setProp", N("pSearchResults")],
        ["pushZero"], ["setProp", N("pLastTotal")],
        ["pushZero"], ["setProp", N("pWipes")],
    ]);

    /* Closing the hand ends the search and any walk in progress, but KEEPS
       the index. The inventory does not change because a window shut, and the
       walk is the expensive part — so reopening the hand and searching again
       costs nothing. What keeps that honest is setStripItemCount below. */
    const closePrologue = probe ? null : assemble([
        ["pushZero"], ["setProp", N("pSearchScan")],
        ["pushZero"], ["setProp", N("pSearchActive")],
        ["pushZero"], ["setProp", N("pSearchPending")],
        ["pushZero"], ["setProp", N("pIndexBlocked")],
        ["pushZero"], ["setProp", N("pWalkPaused")],
        ["pushZero"], ["setProp", N("pSearchPage")],
        ["pushCons", L("")], ["setProp", N("pSearchTerm")],
        ["pushArgList", 0], ["pushList"], ["setProp", N("pSearchResults")],
    ]);
    const guardPrologue = assemble([
        ["getProp", N("pAnimMode")], ["pushSymb", N("open")], ["eq"], ["not"],
        ["jmpIfZ", { label: "body" }],
        ["pushZero"], ["pushArgListNoRet", 1], ["extCall", N("return")],
        ["label", "body"],
    ]);

    /* Any handler whose code changes length needs its line block regenerated
       to match, or the block stops describing the code it belongs to. */
    if (!probe) {
        const construct = findHandler("construct");
        construct.code = Buffer.concat([constructPrologue, construct.code]);
        construct.lines = lineBlockFor(construct.code.length);
    }

    /* THE ROOM-CHANGE FIX, and why WHERE the test sits is the whole thing.
     *
     * The bug is the hand's buttons surviving on screen after the hand
     * auto-closes on a room change. The 351 update ships a fix for it, but
     * placed after the window-creation block:
     *
     *     if not windowExists(pHandButtonsWnd) then
     *         createWindow(pHandButtonsWnd, "habbo_hand_buttons.window")
     *         if that failed then return 0
     *     end if
     *     if me.pAnimMode <> #open then return 0        <- too late
     *
     * close() has already run removeWindow, so windowExists is false and the
     * window is BUILT AGAIN before the test is reached. The test then stops
     * the positioning, the activation and the procedure registration — but
     * the window exists and is on screen, which is the whole bug. Tested on
     * the 351 client: the buttons still stay up.
     *
     * Ours returns before windowExists is consulted, so nothing is rebuilt.
     * Hence the test below is not "is pAnimMode mentioned" but "is it
     * consulted before the window can be created". If they later move their
     * check above the creation, this stops adding ours. */
    const guard = findHandler("setHandButtonsVisible");
    const firstAt = (spec) => {
        const probe = assemble([spec]);
        const want = disassemble(probe, { codeOffset: 0, codeLength: probe.length }).code[0];
        const code = disassemble(guard.code, { codeOffset: 0, codeLength: guard.code.length }).code;
        return code.findIndex(i => i.op === want.op && i.operand === want.operand);
    };
    const animAt = firstAt(["getProp", N("pAnimMode")]);
    const createAt = firstAt(["extCall", N("createWindow")]);
    const guarded = animAt >= 0 && (createAt < 0 || animAt < createAt);
    if (guarded) {
        console.log("  setHandButtonsVisible already checks pAnimMode before creating the window — leaving it alone");
    } else {
        if (animAt >= 0) {
            console.log(`  setHandButtonsVisible checks pAnimMode only AFTER createWindow (instruction ${animAt} vs ${createAt}) — that rebuilds the window before it bails, so adding the guard that returns first`);
        }
        guard.code = Buffer.concat([guardPrologue, guard.code]);
        guard.lines = lineBlockFor(guard.code.length);
    }

    if (!probe) {
        const closeHandler = findHandler("close");
        closeHandler.code = Buffer.concat([closePrologue, closeHandler.code]);
        closeHandler.lines = lineBlockFor(closeHandler.code.length);

        /* AN ITEM ARRIVING, indexed from the item itself.
         *
         * This used to be left to Refresh, which runs straight after
         * appendStripItem and re-indexes whatever pItemList holds. That is
         * indirect, and it depends on the new item still being in pItemList
         * by the time Refresh looks — which held for the first furni picked
         * up and not for the second, so the second never reached the index
         * and never came back into the results.
         *
         * appendStripItem is handed the item. Putting it in the index here is
         * not an inference about list contents, it is the fact itself, and it
         * cannot be undone by anything that rewrites pItemList in between.
         * Re-indexing the same item twice costs nothing: the index is keyed
         * by stripId, so Refresh's pass is simply a no-op afterwards. */
        const appendPrologue = assemble([
            ["getProp", N("pSearchIndex")],
            ["getParam", 1], ["pushSymb", N("stripId")],
            ["pushArgList", 2], ["objCall", N("getAt")],
            ["getParam", 1],
            ["pushArgListNoRet", 3], ["objCall", N("setAt")],
        ]);
        const app = findHandler("appendStripItem");
        app.code = Buffer.concat([appendPrologue, app.code]);
        app.lines = lineBlockFor(app.code.length);

        /* An item leaving the hand. placeItemToRoom calls this and never
           calls Refresh, so this is the only chance to notice. The item goes
           out of the index, and if results are on screen they are rebuilt
           around the gap rather than abandoned — placing a furni out of a
           filtered hand leaves the player exactly where they were, one item
           lighter. */
        const removePrologue = assemble([
            ["getProp", N("pSearchIndex")], ["getParam", 1],
            ["pushArgList", 2], ["objCall", N("getAt")],
            ["pushArgList", 1], ["extCall", N("voidp")],
            ["jmpIfZ", { label: "doDelete" }],
            ["jmp", { label: "afterIndex" }],
            ["label", "doDelete"],
            ["getProp", N("pSearchIndex")], ["getParam", 1],
            ["pushArgListNoRet", 2], ["objCall", N("deleteProp")],
            ["label", "afterIndex"],
            ["getProp", N("pSearchActive")], ["jmpIfZ", { label: "body" }],
            ["getParam", 0], ["pushArgList", 1], ["objCall", N("refilterSearch")],
            ["pushArgListNoRet", 1], ["extCall", N("return")],
            ["label", "body"],
        ]);
        const rem = findHandler("removeStripItem");
        rem.code = Buffer.concat([removePrologue, rem.code]);
        rem.lines = lineBlockFor(rem.code.length);

        /* THE WALK STAYS OFF SCREEN.
         *
         * Refresh already returns before its own redraw for a page that only
         * the walk asked for, but that is not the only way the item area gets
         * drawn. createStripItem starts a dynamic download for any icon the
         * local casts do not have, and stripItemDownloadCallback answers it
         * with showContainerItems() — which paints whatever pItemList holds
         * at that moment. During a walk that is each page in turn, so the
         * hand visibly flicks through the inventory.
         *
         * Blocking it at the one place every path goes through is better
         * than guarding each caller. While the walk owns the cursor nothing
         * paints; the moment it does not, everything paints as before.
         *
         * pWalkPaused is the exception and has to be: a paused walk means the
         * page that just arrived is one the PLAYER turned, and that must
         * still be drawn. And the results themselves are safe — Refresh
         * clears pSearchScan before it calls finishHandSearch. */
        const quietPrologue = assemble([
            ["getProp", N("pSearchScan")], ["jmpIfZ", { label: "body" }],
            ["getProp", N("pWalkPaused")], ["jmpIfZ", { label: "blocked" }],
            ["jmp", { label: "body" }],
            ["label", "blocked"],
            ["pushZero"], ["pushArgListNoRet", 1], ["extCall", N("return")],
            ["label", "body"],
        ]);
        /* BOTH of them, and the asymmetry was a bug. Guarding only the show
           meant anything that hid the item area during a walk left it hidden
           — nothing was permitted to paint it back until the walk finished.
           That is the results vanishing for a second after placing a furni
           and then returning. Hidden and shown are two halves of one redraw;
           suppressing one without the other cannot be right. */
        for (const name of ["showContainerItems", "hideContainerItems"]) {
            const h = findHandler(name);
            h.code = Buffer.concat([quietPrologue, h.code]);
            h.lines = lineBlockFor(h.code.length);
        }

    }

    for (const name of (probe ? ["eventProcHandButtons"] : ["Refresh", "eventProcHandButtons"])) {
        const h = findHandler(name);
        const a = assembleFor(built[name]);
        h.code = a.code;
        h.args = a.args;
        h.locals = a.locals;
        h.lines = lineBlockFor(h.code.length);
    }

    /* New handlers continue the source-position sequence rather than starting
       at zero, which is a value @34 never holds anywhere in the client. */
    const last = s.handlers[s.handlers.length - 1].rec;
    let srcChar = last.readUInt32BE(R.unknown1);
    let srcLine = last.readUInt16BE(R.unknown2);

    /* traceSearch only exists to write diagnostics into the search box, and
       nothing calls it unless --diag2 or --diag3 built those calls in. Adding
       it to a shipped build leaves a handler that is never reached, which is
       exactly the kind of thing a reviewer has to stop and work out. */
    const shipped = NEW_HANDLERS.filter(n => n !== "traceSearch" || diag2 || diag3);
    for (const name of (probe ? [] : shipped)) {
        const a = assembleFor(built[name]);
        srcChar += 400;
        srcLine += 20;
        const rec = Buffer.alloc(HANDLER_REC);
        rec.writeUInt16BE(N(name), R.nameID);
        rec.writeUInt16BE(NEW_RECORD.vectorPos, R.vectorPos);
        rec.writeUInt32BE(srcChar, R.unknown1);
        rec.writeUInt16BE(srcLine, R.unknown2);
        rec.writeUInt32BE(NEW_RECORD.stackHeight, R.stackHeight);
        s.handlers.push({
            rec, nameID: N(name), code: a.code, args: a.args, locals: a.locals,
            globals: [], lines: lineBlockFor(a.code.length),
        });
    }

    s.literalData = Buffer.concat([s.literalData, ...extraLiteralData]);
    const newScript = build(s);

    /* The window layout member. */
    const stxtId = findWindowStxt(cast, bodies, seg);
    const stxtEntry = cast.res.find(e => e.tag === "STXT" && e.id.value === stxtId);
    if (!stxtEntry) throw new Error("could not find the window layout's STXT");
    const stxtRaw = cast.b.subarray(cast.dataStart + stxtEntry.off.value, cast.dataStart + stxtEntry.off.value + stxtEntry.comp.value);
    const stxt = stxtEntry.comp.value === stxtEntry.dec.value ? Buffer.from(stxtRaw) : zlib.inflateSync(stxtRaw);
    const textOff = stxt.readUInt32BE(0), textLen = stxt.readUInt32BE(4), fmtLen = stxt.readUInt32BE(8);
    const newText = rewriteWindowText(stxt.toString("latin1", textOff, textOff + textLen));
    let newStxt = null;
    if (newText) {
        const body = Buffer.from(newText, "latin1");
        newStxt = Buffer.alloc(textOff + body.length + fmtLen);
        newStxt.writeUInt32BE(textOff, 0);
        newStxt.writeUInt32BE(body.length, 4);
        newStxt.writeUInt32BE(fmtLen, 8);
        body.copy(newStxt, textOff);
        stxt.subarray(textOff + textLen).copy(newStxt, textOff + body.length);
    }

    console.log(`  names added: ${added.length ? added.join(", ") : "none"}`);
    const addedHandlers = probe ? 0 : shipped.length;
    console.log(`  mode: ${probe ? "PROBE — window row and one handler branch, nothing else" : probe2 ? "PROBE2 — full structure, startHandSearch stubbed" : diag ? "DIAG — full feature, state reported in the search box" : diag2 ? "DIAG2 — full feature, results/index/total/wipes in the search box" : diag3 ? "DIAG3 — full feature, index size appended to the label" : "full feature"}`);
    console.log(`  handlers: ${s.handlers.length - addedHandlers} -> ${s.handlers.length}`);
    console.log(`  script ${target.chunk.length} -> ${newScript.length} bytes`);
    console.log(`  Lnam ${lnamBuf.length} -> ${writeNames(lnamBuf, names).length} bytes`);
    console.log(`  window layout ${textLen} -> ${newText ? Buffer.byteLength(newText, "latin1") : textLen} chars`);

    if (dryRun) { console.log("\n(dry run — nothing written)"); return; }

    /* Splice both inline bodies back into the blob, longest offset first so
       earlier splices do not move later ones. */
    const newLnam = writeNames(lnamBuf, names);
    const edits = [
        { body: bodies.get(target.e.id.value), buf: newScript, entry: target.e },
        { body: lnamBody, buf: newLnam, entry: byId.get(lnamId) },
    ].sort((a, b) => b.body.at - a.body.at);

    let newSeg = seg;
    for (const ed of edits) {
        newSeg = Buffer.concat([
            newSeg.subarray(0, ed.body.at), ed.buf, newSeg.subarray(ed.body.at + ed.body.len),
        ]);
        ed.entry.dec.changed = ed.buf.length;
        ed.entry.comp.changed = ed.buf.length;
    }
    ils.dec.changed = newSeg.length;

    const replacements = new Map();
    replacements.set(ils.id.value, zlib.deflateSync(newSeg));
    if (newStxt) replacements.set(stxtEntry.id.value, zlib.deflateSync(newStxt));
    if (newStxt) stxtEntry.dec.changed = newStxt.length;

    const newData = rebuildData(cast, replacements);
    const map = buildMap(cast);
    const z = zlib.deflateSync(map);
    const inner = Buffer.concat([writeVint(cast.abmp.ctype), writeVint(map.length), z]);
    const abmpSection = Buffer.concat([
        cast.b.subarray(cast.abmp.tagAt, cast.abmp.tagAt + 4), writeVint(inner.length), inner,
    ]);
    const out = Buffer.concat([
        cast.b.subarray(0, cast.abmp.tagAt), abmpSection,
        cast.b.subarray(cast.abmp.sectionEnd, cast.dataStart), newData,
    ]);
    const sizeDelta = out.length - cast.b.length;
    const readSize = cast.big ? out.readUInt32BE.bind(out) : out.readUInt32LE.bind(out);
    const writeSize = cast.big ? out.writeUInt32BE.bind(out) : out.writeUInt32LE.bind(out);
    writeSize(readSize(4) + sizeDelta, 4);

    if (!fs.existsSync(backup)) {
        fs.copyFileSync(file, backup);
        console.log(`  original saved to ${path.basename(backup)}`);
    }
    fs.writeFileSync(file, out);
    console.log(`  wrote ${CAST} (${cast.b.length} -> ${out.length} bytes)`);
}

/* The layout member's text lives in an STXT owned by the CASt record; KEY*
   links child to parent, little-endian while the container around it is not. */
function findWindowStxt(cast, bodies, seg) {
    const { readMember } = require("./cct-extract.js");
    const keyEntry = cast.res.find(e => e.tag === "KEY*");
    const kb = keyEntry.off.value < 0
        ? seg.subarray(bodies.get(keyEntry.id.value).at, bodies.get(keyEntry.id.value).at + bodies.get(keyEntry.id.value).len)
        : zlib.inflateSync(cast.b.subarray(cast.dataStart + keyEntry.off.value, cast.dataStart + keyEntry.off.value + keyEntry.comp.value));
    const es = kb.readUInt16LE(0), hl = kb.readUInt16LE(2), used = kb.readUInt32LE(8);

    let memberId = null;
    for (const e of cast.res) {
        if (e.tag !== "CASt") continue;
        const body = bodies.get(e.id.value);
        if (!body) continue;
        const m = readMember(seg.subarray(body.at, body.at + body.len));
        if (m && m.name === WINDOW_MEMBER) { memberId = e.id.value; break; }
    }
    if (memberId === null) throw new Error(`no cast member named ${WINDOW_MEMBER}`);

    for (let i = 0; i < used; i++) {
        const o = hl + i * es;
        if (o + es > kb.length) break;
        if (kb.readUInt32LE(o + 4) !== memberId) continue;
        const tag = kb.toString("latin1", o + 8, o + 12).split("").reverse().join("");
        if (tag === "STXT") return kb.readUInt32LE(o);
    }
    throw new Error(`no STXT under ${WINDOW_MEMBER}`);
}

/* The container reader/writer is shared with tools/fix-green-teleport.js,
   which adds a cast member rather than rewriting a script. */
module.exports = { openContainer, buildMap, rebuildData, readVint, writeVint, lineBlockFor };

if (require.main === module) run(process.argv.slice(2));

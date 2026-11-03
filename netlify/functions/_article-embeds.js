/* The embed blocks an article's text may hold, and what each may carry
   (2 Nov 2026, the owner's Articles). THE ALLOW-LIST: see THE EMBED
   CONTRACT at the top of js/article-text.js for the whole arrangement.

   An embed is a line of the body of its own, {{type name=value ...}}, read
   by js/article-text.js (the same file the page draws it with). This says
   which types may be stored, which names each may carry and what each
   value must look like, and which must be there. A type not listed here is
   refused on save, so nothing reaches a reader's page that this file did
   not let through; the browser only ever draws what was stored.

     attrs     name -> a RegExp or a function(value) -> true, for each name
               the type may carry. `ref` names the article's embedData entry.
     required  the names it must have.
     data      optional: function(value, article) -> the cleaned object to
               store as embedData[ref], or { error } to refuse the save. A
               type without one may not have embedData at all.

   VIDEO is built (its entry says what it carries). WHEEL is put down here
   as a place to build on: the prize-wheel replay (a snapshot of a row of
   event_entry_draws in netlify/functions/event-entries.js) changes its own
   entry to fit what it builds, and adds `data` if it keeps more than
   attributes. */
const { isSafeKey } = require("./_keys");

const REF = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A key in this site's blob store, in one of the named folders, of one of these kinds.
const keyIn = (folders, ext) => v => typeof v === "string" && isSafeKey(v)
    && folders.some(f => v.startsWith(f + "/")) && ext.test(v);

const EMBEDS = {
    /* An uploaded video (2 Nov 2026; js/article-video.js draws it):
         key     the video, as upload-video.js names it (KEY in _videos.js,
                 which this mirrors rather than requires, so saving an
                 article never loads the blob store)
         poster  its still, a picture uploaded to "articles/" like any other
         w, h    its size in pixels, so the page keeps its shape before it loads
         len     its length in seconds, shown on the still before anything
                 of the video is fetched */
    video: {
        attrs: {
            key: v => typeof v === "string" && /^videos\/[a-z0-9-]{1,80}\/\d{13}-[a-z0-9-]{1,80}\.(mp4|webm)$/.test(v),
            poster: keyIn(["articles"], /\.(png|jpe?g|gif|webp)$/i),
            w: /^[1-9]\d{0,4}$/,
            h: /^[1-9]\d{0,4}$/,
            len: /^\d{1,5}(\.\d)?$/,
            ref: REF
        },
        required: ["key"]
    },
    /* A replay of a prize-wheel draw (2 Nov 2026; js/article-wheel.js draws
       it, js/wheel-draw.js's snapshot makes its data):
         ref     its embedData entry, the draw's snapshot (wheelData)
         draw    the draw's own id in event_entry_draws, so the Warren can
                 tell which articles hold which draw */
    wheel: {
        attrs: {
            ref: REF,
            draw: /^[A-Za-z0-9_-]{1,64}$/
        },
        required: ["ref", "draw"],
        data: v => wheelData(v)
    }
};

/* A draw's snapshot, checked strictly and rebuilt from its own fields
   (nothing else is carried across): the wheel's names in order, display
   names only, one per slice; each slice's colour; which slice won; the
   spin's numbers, `where` inside the winning slice as the wheel always
   stops; the event's title, the prize line and when it was drawn; and
   `rebuilt` for a draw from before the wheel recorded itself (see
   WheelDraw.snapshot). Limits as event-entries.js's REPLAY_MAX,
   HABBO_NAME_MAX and PRIZE_MAX. */
const WHEEL_SLICES = 400, WHEEL_NAME = 60, WHEEL_COLOURS = 5;
const TAU = Math.PI * 2;
// Control characters, and any space but a plain one (a line or paragraph separator, a tab).
const CONTROL = /[\u0000-\u001f\u007f]|[^\S ]/;
function wheelData(v) {
    const bad = what => ({ error: `The {{wheel}} block's draw ${what}. Put the draw in again with the Wheel draw button.` });
    if (!v || typeof v !== "object" || Array.isArray(v)) return bad("is missing");
    if (v.v !== 1) return bad("is from a version the site can't replay");
    const line = (s, max) => typeof s === "string" && s.length <= max && !CONTROL.test(s) && s === s.trim();
    if (!line(v.event, 120)) return bad("has an event title the site can't use");
    if (!line(v.prize, 80)) return bad("has a prize line the site can't use");
    if (typeof v.drawnAt !== "string" || v.drawnAt.length > 40 || (v.drawnAt && !Number.isFinite(Date.parse(v.drawnAt)))) return bad("has a date the site can't read");
    const names = v.names;
    if (!Array.isArray(names) || names.length < 1 || names.length > WHEEL_SLICES) return bad(`must have between 1 and ${WHEEL_SLICES} names`);
    if (names.some(s => !line(s, WHEEL_NAME) || !s)) return bad("has a name the site can't use");
    const n = names.length;
    const colours = v.colours;
    if (!Array.isArray(colours) || colours.length !== n || colours.some(c => !Number.isInteger(c) || c < 0 || c >= WHEEL_COLOURS)) return bad("has colours that don't match its names");
    const num = x => typeof x === "number" && Number.isFinite(x);
    if (!Number.isInteger(v.win) || v.win < 0 || v.win >= n) return bad("has no winning slice");
    if (!num(v.from) || Math.abs(v.from) > TAU) return bad("has a starting turn the site can't use");
    if (!num(v.where) || v.where <= v.win * TAU / n || v.where >= (v.win + 1) * TAU / n) return bad("doesn't land on its winner");
    if (!Number.isInteger(v.turns) || v.turns < 6 || v.turns > 8) return bad("has a spin the site can't use");
    if (!num(v.decel) || v.decel < 8.6 || v.decel > 10.2) return bad("has a spin the site can't use");
    if (v.rebuilt !== undefined && typeof v.rebuilt !== "boolean") return bad("isn't one the site can use");
    const out = {
        v: 1, event: v.event, prize: v.prize, drawnAt: v.drawnAt,
        names: names.slice(), colours: colours.slice(),
        win: v.win, from: v.from, where: v.where, turns: v.turns, decel: v.decel
    };
    if (v.rebuilt === true) out.rebuilt = true;
    return out;
}

const EMBED_DATA_MAX = 20;
const EMBED_DATA_BYTES = 48 * 1024;

/* Every embed in a body checked against EMBEDS, and embedData cleaned
   against them. `blocks` is ArticleText.embeds(body). Returns
   { embedData } (the cleaned map, {} for none) or { error }. */
function checkEmbeds(blocks, embedData, article) {
    const refs = new Map();
    for (const b of blocks) {
        const rule = Object.prototype.hasOwnProperty.call(EMBEDS, b.type) ? EMBEDS[b.type] : null;
        const line = `{{${b.type}}}`;
        if (!rule) return { error: `The article has a ${line} block, which the site can't show. Take that line out.` };
        for (const [name, value] of Object.entries(b.attrs)) {
            const test = Object.prototype.hasOwnProperty.call(rule.attrs, name) ? rule.attrs[name] : null;
            const ok = test instanceof RegExp ? test.test(value) : typeof test === "function" ? test(value) === true : false;
            if (!ok) return { error: `The ${line} block's "${name}" isn't one the site can use.` };
        }
        for (const name of rule.required || []) {
            if (!Object.prototype.hasOwnProperty.call(b.attrs, name)) return { error: `The ${line} block needs its "${name}".` };
        }
        if (b.ref) {
            if (refs.has(b.ref) && refs.get(b.ref) !== b.type) return { error: `Two different blocks share the name "${b.ref}".` };
            refs.set(b.ref, b.type);
        }
    }
    if (embedData === undefined || embedData === null) return { embedData: {} };
    if (typeof embedData !== "object" || Array.isArray(embedData)) return { error: `"embedData" must be an object.` };
    const keys = Object.keys(embedData);
    if (keys.length > EMBED_DATA_MAX) return { error: `An article can hold at most ${EMBED_DATA_MAX} blocks' data.` };
    const out = {};
    for (const ref of keys) {
        // Data no block names any more is left behind, not stored.
        if (!REF.test(ref) || !refs.has(ref)) continue;
        const rule = EMBEDS[refs.get(ref)];
        if (typeof rule.data !== "function") return { error: `A {{${refs.get(ref)}}} block can't carry data yet.` };
        const cleaned = rule.data(embedData[ref], article);
        if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) return { error: `The {{${refs.get(ref)}}} block's data isn't usable.` };
        if (cleaned.error) return { error: String(cleaned.error) };
        out[ref] = cleaned;
    }
    if (JSON.stringify(out).length > EMBED_DATA_BYTES) return { error: "The article's blocks carry too much data." };
    return { embedData: out };
}

module.exports = { EMBEDS, checkEmbeds, REF };

/* Checks the quiz bank. Run before committing any change to js/quiz-bank-*.js:
 *
 *     node tools/quiz-check.js
 *
 * What it can prove, and what it cannot. It catches STRUCTURAL faults — a
 * question asked twice, a draft note left in an answer, an entry that is not
 * a proper pair, an id collision — and it is worth running because at a
 * couple of thousand questions those are invisible by eye. It cannot check
 * whether an answer is TRUE. Nothing here can. Facts have to be right when
 * they are written.
 *
 * The id check matters more than it looks. js/quiz.js identifies a question
 * by a hash of its text so the never-repeat history survives the bank being
 * edited; two questions hashing the same would make one of them permanently
 * unaskable once the other had been seen. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'js');

/* The bank files assign into window.QUIZ_QUESTIONS, so give them a window. */
global.window = {};
require(path.join(JS, 'quiz-questions.js'));
fs.readdirSync(JS)
    .filter(f => /^quiz-bank-.*\.js$/.test(f))
    .sort()
    .forEach(f => require(path.join(JS, f)));

const CATS = global.window.QUIZ_CATEGORIES;
const BANK = global.window.QUIZ_QUESTIONS;

/* Must match qid() in js/quiz.js exactly, or the collision check is checking
   something the app does not use. */
function qid(text) {
    const s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
}

const problems = [];
const seenText = new Map();
const seenId = new Map();
let total = 0;

/* Phrases that only ever appear in something half-written. These are the ones
   that actually got left in on the first pass — a question that changes its
   mind mid-sentence, and an answer arguing with itself. */
const DRAFT = [
    { re: /\.\.\.\s*(which|what|who|where|when)\b/i, why: 'question changes direction mid-sentence' },
    /* Two questions crammed into one field. A "?" followed by another
       interrogative opener is never one question, and a host reading it
       aloud would ask both and have one answer for them. */
    { re: /\?\s+(which|what|who|where|when|how|name)\b/i, why: 'two questions in one field' },
    { re: /\bno:\s/i, why: 'answer contains a correction note' },
    { re: /\bskip\b/i, why: 'leftover marker' },
    { re: /\bTODO\b|\bFIXME\b/i, why: 'leftover marker' },
    { re: /\brival\b.*\bhit\b|\bsuccessor era\b/i, why: 'contorted framing' },
    { re: /\bdup\b/i, why: 'leftover marker' }
];

CATS.forEach(cat => {
    const rows = BANK[cat.id];
    if (!rows) { problems.push(`[${cat.id}] declared in QUIZ_CATEGORIES but has no bank`); return; }
    if (!rows.length) { problems.push(`[${cat.id}] bank is empty`); return; }

    rows.forEach((row, i) => {
        const at = `[${cat.id}:${i}]`;

        if (!Array.isArray(row) || row.length !== 2) {
            problems.push(`${at} not a [question, answer] pair`);
            return;
        }
        const [q, a] = row;
        if (typeof q !== 'string' || typeof a !== 'string' || !q.trim() || !a.trim()) {
            problems.push(`${at} blank question or answer`);
            return;
        }
        total++;

        if (q !== q.trim()) { problems.push(`${at} question has stray whitespace: ${JSON.stringify(q)}`); }
        if (a !== a.trim()) { problems.push(`${at} answer has stray whitespace: ${JSON.stringify(a)}`); }
        if (!/[?]$/.test(q.trim())) { problems.push(`${at} question does not end in "?": ${q}`); }

        DRAFT.forEach(d => {
            if (d.re.test(q)) { problems.push(`${at} ${d.why} (question): ${q}`); }
            if (d.re.test(a)) { problems.push(`${at} ${d.why} (answer): ${a}`); }
        });

        /* Cross-category duplicates are the important ones: the same question
           in two categories is asked twice by a host who picked both. */
        const norm = q.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (seenText.has(norm)) {
            problems.push(`${at} duplicate question, also at ${seenText.get(norm)}: ${q}`);
        } else {
            seenText.set(norm, at);
        }

        const id = qid(q);
        if (seenId.has(id) && seenId.get(id) !== norm) {
            problems.push(`${at} ID COLLISION with ${seenText.get(seenId.get(id))}: ${q}`);
        } else {
            seenId.set(id, norm);
        }
    });
});

/* A near-duplicate report, printed but not counted as a failure: two
   questions with the same answer are usually fine (plenty of things are
   "France"), but a pile of them in one category means a thin round. */
const byAnswer = new Map();
CATS.forEach(cat => {
    (BANK[cat.id] || []).forEach(row => {
        if (!Array.isArray(row) || row.length !== 2) { return; }
        const key = cat.id + '|' + String(row[1]).toLowerCase().replace(/[^a-z0-9]+/g, '');
        byAnswer.set(key, (byAnswer.get(key) || 0) + 1);
    });
});
const repeated = [...byAnswer.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);

console.log('per category');
CATS.forEach(cat => {
    const n = (BANK[cat.id] || []).length;
    console.log('  ' + String(n).padStart(5) + '  ' + cat.id.padEnd(11) + cat.label);
});
console.log('  ' + String(total).padStart(5) + '  TOTAL');

if (repeated.length) {
    console.log('\nsame answer 4+ times in one category (review, not a failure)');
    repeated.forEach(([k, n]) => console.log('  ' + String(n).padStart(3) + '  ' + k));
}

if (problems.length) {
    console.log('\n' + problems.length + ' PROBLEM(S)');
    problems.forEach(p => console.log('  ' + p));
    process.exit(1);
}
console.log('\nno structural problems');

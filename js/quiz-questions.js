/* The quiz's category list, and the registry the banks load into.
 *
 * This file holds NO questions. It declares the categories and creates the
 * object the bank files fill, and it must load before any of them — see the
 * script order in quiz.html.
 *
 * The questions live in js/quiz-bank-*.js, one file to a category, so the
 * file you want is the one named after the thing you are fixing. There is no
 * build step joining them together, deliberately — this site does not have
 * one for its pages, and a generated file committed alongside its sources is
 * a thing that goes stale.
 *
 * MULTIPLE CHOICE since 16 Nov 2026. A question is a row of five strings:
 *
 *     [question, the right answer, wrong, wrong, wrong]
 *
 * The right answer is ALWAYS second. The app shuffles the four into A to D
 * each time a question is asked, so nothing about a row's order reaches the
 * room. The bank before this date was question-and-answer pairs with no
 * wrong answers to offer; it is in the git history, not here.
 *
 * A question's IDENTITY is not its position in these arrays — it is a hash
 * of the question text, computed in js/quiz.js. That is what lets the
 * never-repeat history survive questions being added, reordered or moved
 * between categories, which an index cannot. The practical rule that
 * follows: EDITING A QUESTION'S WORDING MAKES IT A NEW QUESTION, and it can
 * come up again for someone who has already had it. Fixing an answer or a
 * wrong option is free; rewording the question is not.
 *
 * The rules these are written to:
 *
 *   - The answer never appears in the question, in whole or in part.
 *   - Exactly one option is right. The other three are plausible, of the
 *     same kind as the answer, and definitely wrong.
 *   - Nothing that changes with time: no "current", "latest" or records
 *     waiting to be beaten.
 *   - Fun, office-safe and easy to medium: a room of ordinary British adults
 *     should get about two in three. The host reads these to colleagues at
 *     work, and a wrong answer on the card embarrasses the host, so a fact
 *     that needed looking up to be sure of does not go in.
 *   - No sport. Geography stays at capital-cities level. (The host's calls.)
 *
 * Run `node tools/quiz-check.js` after any change to a bank.
 */

window.QUIZ_CATEGORIES = [
    { id: 'movies',    label: "Film",              icon: '\u{1F3AC}' },
    { id: 'tv',        label: "TV",                icon: '\u{1F4FA}' },
    { id: 'music',     label: "Music",             icon: '\u{1F3B5}' },
    { id: 'food',      label: "Food & Drink",      icon: '\u{1F355}' },
    { id: 'animals',   label: "Animals",           icon: '\u{1F98A}' },
    { id: 'geography', label: "Easy Geography",    icon: '\u{1F30D}' },
    { id: 'science',   label: "Science & Nature",  icon: '\u{1F52C}' },
    { id: 'general',   label: "General Knowledge", icon: '\u{1F9E0}' },
    { id: 'pop',       label: "Pop Culture",       icon: '\u{1F31F}' },
    { id: 'nostalgia', label: "80s, 90s & 00s",    icon: '\u{1F4FC}' }
];

/* Filled by the bank files. Created here rather than in whichever bank
   happens to load first, so the order of the script tags cannot matter
   beyond this file being ahead of them.

   One bank is not in the list above: `xmas`, the Christmas questions. It is
   not a category to tick. The "Christmas quiz" switch on the setup card
   makes every other question one of them. */
window.QUIZ_QUESTIONS = {};

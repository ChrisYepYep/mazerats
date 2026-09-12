/* The quiz's category list, and the registry the banks load into.
 *
 * This file holds NO questions. It declares the categories and creates the
 * object the bank files fill, and it must load before any of them — see the
 * script order in quiz.html.
 *
 * The questions live in js/quiz-bank-*.js, split by subject rather than kept
 * in one file. At a couple of thousand questions a single file is a quarter
 * of a megabyte that has to be opened, scrolled and re-read every time one
 * answer needs correcting; split, the file you want is the one named after
 * the thing you are fixing. There is no build step joining them back
 * together, deliberately — this site does not have one, and a generated file
 * committed alongside its sources is a thing that goes stale.
 *
 * A question is a pair, [question, answer]. Its IDENTITY, though, is not its
 * position in these arrays — it is a hash of the question text, computed in
 * js/quiz.js. That is what lets the never-repeat history survive questions
 * being added, reordered or moved between categories, which an index cannot.
 * The practical rule that follows: EDITING A QUESTION'S WORDING MAKES IT A
 * NEW QUESTION, and it can come up again for someone who has already had it.
 * Fixing a wrong answer is free; rewording the question is not.
 *
 * Difficulty target throughout is "a pub on a Tuesday" — a table of ordinary
 * people should get most of a round. Anything that needed looking up to set
 * is too hard to ask. Where an answer has a common alternative a fair host
 * would accept, it goes in the answer text in brackets, so the host sees it
 * at the moment they need it.
 */

window.QUIZ_CATEGORIES = [
    { id: 'pop2000s',  label: "2000s Pop Culture", icon: '\u{1F4BF}' },
    { id: 'pop1990s',  label: "90s Pop Culture",   icon: '\u{1F4FC}' },
    { id: 'pop1980s',  label: "80s Pop Culture",   icon: '\u{1F576}' },
    { id: 'music',     label: "Music",             icon: '\u{1F3B5}' },
    { id: 'movies',    label: "Movies",            icon: '\u{1F3AC}' },
    { id: 'tv',        label: "TV",                icon: '\u{1F4FA}' },
    { id: 'geography', label: "Geography",         icon: '\u{1F30D}' },
    { id: 'history',   label: "History",           icon: '\u{1F3DB}' },
    { id: 'science',   label: "Science",           icon: '\u{1F52C}' },
    { id: 'animals',   label: "Animals",           icon: '\u{1F98A}' },
    { id: 'food',      label: "Food & Drink",      icon: '\u{1F355}' },
    { id: 'sport',     label: "Sport",             icon: '⚽' },
    { id: 'games',     label: "Games & Internet",  icon: '\u{1F3AE}' },
    { id: 'words',     label: "Words & Language",  icon: '\u{1F4D6}' },
    { id: 'general',   label: "General Knowledge", icon: '\u{1F9E0}' }
];

/* Filled by the bank files. Created here rather than in whichever bank
   happens to load first, so the order of the script tags cannot matter
   beyond this file being ahead of them. */
window.QUIZ_QUESTIONS = {};

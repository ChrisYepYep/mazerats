/* Quiz Night — the host's app at /quiz.
 *
 * One person holds this phone and runs a quiz out loud for a room. That single
 * fact decides nearly every choice below:
 *
 *   - every question is multiple choice, A to D, and NOTHING on the screen
 *     says which is right — not even to the host (16 Nov 2026, replacing the
 *     old answer-under-the-question layout). The host taps the answer the
 *     room goes for and it turns green or red. That is what makes "Ask the
 *     Host" an honest lifeline, and it is the host's own request.
 *
 *   - a wrong tap does not end the question. It goes red and stays red, and
 *     the other answers stay live, because a wrong answer opens the question
 *     back up to everyone else.
 *
 *   - each player has three lifelines, once each per quiz: 50:50, Ask the
 *     Host, Rule Out. The app records who has spent what, takes two wrong
 *     answers away for 50:50, and for Rule Out says whether the answer the
 *     player names is a wrong one. Ask the Host is between the host and the
 *     room. No lifeline changes the score: a right answer is one point.
 *
 *   - scoring is one tap on a name, and it is a TOGGLE. A host mis-taps, or
 *     the room argues and a point gets taken back. Awards are stored per
 *     question rather than as a running total, so going Back and un-tapping
 *     undoes the point exactly — a counter you only ever increment cannot be
 *     walked backwards without guessing what it was.
 *
 *   - every change is written to localStorage immediately. A quiz night lasts
 *     an hour, during which the phone will lock, a call will come in, and the
 *     browser will quietly evict the tab. None of that may lose the scores,
 *     so there is no "session" in memory that matters: the state object IS the
 *     saved object, and save() runs after every mutation.
 *
 * No network, no accounts, no server. The whole quiz lives in one localStorage
 * key on the host's own device.
 */

(function () {
    'use strict';

    var STORE_KEY = 'mazerats.quiz.v1';
    /* 2, not 1: `order` used to hold "cat:index" keys and now holds text
       hashes, so a quiz saved by the previous version points at nothing. It is
       discarded rather than migrated — the indices it holds cannot be mapped
       to the new ids now the bank has been rewritten around them. */
    /* 3: multiple choice. A quiz saved by version 2 holds ids from the old
       question-and-answer bank, none of which exist any more. */
    var STATE_VERSION = 3;

    /* ---------------------------------------------------------------- dom */

    var $ = function (id) { return document.getElementById(id); };

    var el = {
        setup: $('qz-setup'),
        play: $('qz-play'),
        done: $('qz-done'),

        resume: $('qz-resume'),
        resumeDetail: $('qz-resume-detail'),
        resumeGo: $('qz-resume-go'),
        resumeDrop: $('qz-resume-drop'),

        addForm: $('qz-add-form'),
        addName: $('qz-add-name'),
        addBtn: $('qz-add-btn'),
        addHint: $('qz-add-hint'),
        players: $('qz-players'),
        playersEmpty: $('qz-players-empty'),
        playerCount: $('qz-player-count'),

        cats: $('qz-cats'),
        catAll: $('qz-cat-all'),
        catReset: $('qz-cat-reset'),
        catNote: $('qz-cat-note'),

        length: $('qz-length'),
        start: $('qz-start'),

        progressFill: $('qz-progress-fill'),
        progressText: $('qz-progress-text'),
        catPill: $('qz-cat-pill'),
        question: $('qz-question'),
        opts: $('qz-opts'),
        suspense: $('qz-suspense'),
        reveal: $('qz-reveal'),
        show: $('qz-show'),
        banner: $('qz-banner'),
        optTest: $('qz-opt-test'),
        optXmas: $('qz-opt-xmas'),
        xmasNote: $('qz-xmas-note'),
        awardGrid: $('qz-award-grid'),
        stage: $('qz-stage'),
        prev: $('qz-prev'),
        next: $('qz-next'),

        scoreBtn: $('qz-score-btn'),
        menuBtn: $('qz-menu-btn'),

        backdrop: $('qz-sheet-backdrop'),
        sheet: $('qz-sheet'),
        sheetClose: $('qz-sheet-close'),
        board: $('qz-board'),

        menu: $('qz-menu'),
        menuClose: $('qz-menu-close'),
        optWake: $('qz-opt-wake'),
        menuFinish: $('qz-menu-finish'),
        menuAbandon: $('qz-menu-abandon'),

        final: $('qz-final'),
        again: $('qz-again'),
        newQuiz: $('qz-newquiz')
    };

    var CATS = window.QUIZ_CATEGORIES || [];
    var BANK = window.QUIZ_QUESTIONS || {};
    var SOUND = window.QuizAudio || null;

    /* The Christmas bank's id. Not in CATS: it is not a category to tick but
       a switch that makes every other question a Christmas one. */
    var XMAS = 'xmas';

    /* The lifelines, in the order their buttons sit beside a name. */
    var LIFELINES = [
        { id: 'fifty',  label: '50:50', name: '50:50' },
        { id: 'host',   label: 'Host',  name: 'Ask the Host' },
        /* Rule Out replaced Second Guess the day both were built (16 Nov
           2026): the host did not like a free wrong answer. */
        { id: 'rule',   label: 'Rule out', name: 'Rule Out' }
    ];
    var LETTERS = ['A', 'B', 'C', 'D'];

    /* -------------------------------------------------------------- state */

    /* `draft` is what the setup card is building and is NOT the saved quiz —
       a half-filled setup card is not worth restoring over a real quiz in
       progress, and conflating the two is how you end up resuming into a
       screen with no questions in it. */
    var draft = {
        players: [],
        cats: CATS.map(function (c) { return c.id; }),
        length: 25,
        xmas: false
    };

    var state = null;

    function blankState() {
        return {
            v: STATE_VERSION,
            phase: 'play',
            players: [],
            cats: [],
            order: [],          /* question ids, in the order they're asked  */
            idx: 0,
            awards: {},         /* question index -> [playerId, …]            */
            adjust: {},         /* playerId -> manual +/- correction          */

            /* Everything below is keyed by question index and speaks of an
               answer by its place in the BANK row (0 is the right one, 1–3
               the wrong ones), never by where it sits on screen. */
            shuf: {},           /* -> [four bank places], top to bottom       */
            picks: {},          /* -> [bank places tapped], in order          */
            shown: {},          /* -> true: the host asked to be shown it     */
            lock: {},           /* -> bank place locked in, awaiting Reveal   */
            fifty: {},          /* -> [two wrong places taken away by 50:50]  */
            rule: {},           /* -> { playerId: place named, or null while
                                        the host has yet to tap it }         */

            life: {},           /* playerId -> { lifelineId: question index } */
            xmas: false,
            suspense: false,    /* the "Lock in first" chip                  */
            keepAwake: true,
            startedAt: Date.now()
        };
    }

    /* ------------------------------------------------------------ storage */

    /* Wrapped because localStorage throws outright in a handful of real
       situations — Safari private browsing historically, and any browser with
       site data blocked. A host who has cookies turned off should still get a
       working quiz for as long as the tab is open, just without the coming
       back to it later. */
    function save() {
        if (!state) { return; }
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (err) {
            /* Nothing to do about it and nothing worth interrupting the host
               with mid-question. The quiz carries on from memory. */
        }
    }

    function load() {
        var raw;
        try {
            raw = localStorage.getItem(STORE_KEY);
        } catch (err) {
            return null;
        }
        if (!raw) { return null; }

        var got;
        try {
            got = JSON.parse(raw);
        } catch (err) {
            return null;
        }

        /* Anything that isn't a quiz of this shape is discarded rather than
           patched up. There is exactly one version so far; when there is a
           second, this is where it gets migrated. */
        if (!got || got.v !== STATE_VERSION) { return null; }
        if (!Array.isArray(got.order) || !got.order.length) { return null; }
        if (!Array.isArray(got.players) || !got.players.length) { return null; }

        ['awards', 'adjust', 'shuf', 'picks', 'shown', 'lock', 'fifty', 'rule', 'life'].forEach(function (k) {
            if (!got[k] || typeof got[k] !== 'object') { got[k] = {}; }
        });
        /* A locked-in answer is a moment, with music under it. Coming back
           to the tab an hour later is not that moment. */
        got.lock = {};
        return got;
    }

    function clearStore() {
        try { localStorage.removeItem(STORE_KEY); } catch (err) { /* fine */ }
    }

    /* -------------------------------------------------------------- utils */

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function catLabel(id) {
        if (id === XMAS) { return 'Christmas'; }
        for (var i = 0; i < CATS.length; i++) {
            if (CATS[i].id === id) { return CATS[i].label; }
        }
        return id;
    }

    /* A question's identity is a hash of its TEXT, not its position in the
       bank. That is the whole reason the never-repeat history works: the bank
       is edited constantly — questions added, reordered, moved between
       categories — and an index-based id would silently come to mean a
       different question, so a host would be told they had already had
       something they had never seen, and shown again something they had.
       Hashing the text makes the id travel with the question.

       FNV-1a, 32-bit, base36. Not a cryptographic hash and does not need to
       be; it needs to be stable, short enough to store a few thousand of, and
       collision-free over this bank — which tools/quiz-check.js verifies on
       every run, using a copy of this exact function. Change one, change the
       other. */
    function qid(text) {
        var s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h.toString(36);
    }

    /* id -> { cat, q, opts }, built once. `opts` is the bank row's four
       answers as written: the right one first, then three wrong. Everything
       downstream looks a question up by id, so a saved quiz survives the bank
       being rewritten underneath it as long as the questions in it still
       exist. */
    var INDEX = {};
    var BY_CAT = {};

    function buildIndex() {
        CATS.map(function (c) { return c.id; }).concat([XMAS]).forEach(function (cat) {
            var rows = BANK[cat] || [];
            var ids = [];
            rows.forEach(function (row) {
                if (!row || row.length !== 5) { return; }
                var id = qid(row[0]);
                /* First writer wins. A collision would mean one question
                   becomes unaskable; the check tool exists so this never
                   reaches production, and silently overwriting would hide it. */
                if (!INDEX[id]) {
                    INDEX[id] = { cat: cat, q: row[0], opts: row.slice(1) };
                    ids.push(id);
                }
            });
            BY_CAT[cat] = ids;
        });
    }

    function questionAt(i) {
        var id = state.order[i];
        return id ? (INDEX[id] || null) : null;
    }

    /* ----------------------------------------------------- asked history */

    /* Kept in its own localStorage key, NOT in the quiz state, because it has
       to outlive the quiz. Abandoning a quiz, finishing one, starting a new
       one with different players — none of those should make a question the
       host has already read out eligible again. */
    var ASKED_KEY = 'mazerats.quiz.asked.v1';
    var asked = Object.create(null);

    function loadAsked() {
        asked = Object.create(null);
        var raw;
        try { raw = localStorage.getItem(ASKED_KEY); } catch (err) { return; }
        if (!raw) { return; }
        try {
            var list = JSON.parse(raw);
            if (Array.isArray(list)) {
                list.forEach(function (id) { asked[id] = 1; });
            }
        } catch (err) { /* unreadable; treat as nothing seen */ }
    }

    function saveAsked() {
        try {
            localStorage.setItem(ASKED_KEY, JSON.stringify(Object.keys(asked)));
        } catch (err) { /* out of space or blocked; the round still works */ }
    }

    /* Test mode (16 Nov 2026): the switch at the foot of the setup card, for
       the host trying the quiz out. A round started with it on is stamped
       `state.test` and marks nothing as asked, so a rehearsal does not eat
       the questions the real quiz is going to need. The stamp is on the
       ROUND, not read from the switch each time: a real quiz resumed later
       must still use its questions up whatever the switch says by then.
       The switch itself is remembered under its own key so it survives the
       reloads that testing is made of. */
    var TEST_KEY = 'mazerats.quiz.test';

    function testWanted() {
        try { return localStorage.getItem(TEST_KEY) === '1'; } catch (err) { return false; }
    }

    function markAsked(id) {
        if (state && state.test) { return; }
        if (!id || asked[id]) { return; }
        asked[id] = 1;
        saveAsked();
    }

    function freshCount(cats) {
        var n = 0;
        cats.forEach(function (c) {
            (BY_CAT[c] || []).forEach(function (id) { if (!asked[id]) { n++; } });
        });
        return n;
    }

    function totalCount(cats) {
        return cats.reduce(function (n, c) { return n + (BY_CAT[c] || []).length; }, 0);
    }

    /* Draws `want` questions spread evenly over the chosen categories rather
       than sampling the combined pool at random — a random sample of a pool
       where one category happens to be bigger gives that category more of the
       round, which is not what "include these categories" means to a host.
       Round-robin first, then shuffle the result so the categories still
       arrive in a jumbled order.

       Questions already asked are excluded outright. If that leaves fewer
       than were asked for, the round is simply shorter — it does NOT quietly
       top up with repeats, because a never-repeat rule that gives up when
       inconvenient is not a rule. The caller reports the shortfall. */
    function drawQuestions(cats, want, xmas) {
        if (!xmas) { return drawFrom(cats, want); }

        /* The Christmas quiz: every other question is a Christmas one. The
           categories fill the odd places (1st, 3rd…) and Christmas the even,
           so a round opens on an ordinary question and the pattern is plain
           by the fourth. Each half is drawn exactly as a whole round would
           be. When one side runs out the round stops there rather than
           carrying on lopsided — "every other" is the promise. */
        var half = want ? Math.ceil(want / 2) : 0;
        var plain = drawFrom(cats, half);
        var fest = drawFrom([XMAS], want ? Math.floor(want / 2) : 0);
        var out = [];
        for (var i = 0; i < plain.length; i++) {
            out.push(plain[i]);
            if (i < fest.length) { out.push(fest[i]); }
            else if (i + 1 < plain.length) { break; }
        }
        return out;
    }

    function drawFrom(cats, want) {
        var pools = [];
        cats.forEach(function (id) {
            var ids = (BY_CAT[id] || []).filter(function (q) { return !asked[q]; });
            if (ids.length) { pools.push(shuffle(ids)); }
        });
        if (!pools.length) { return []; }

        var total = pools.reduce(function (n, p) { return n + p.length; }, 0);
        var target = (!want || want > total) ? total : want;

        var picked = [];
        var round = 0;
        while (picked.length < target) {
            var tookAny = false;
            for (var p = 0; p < pools.length && picked.length < target; p++) {
                if (round < pools[p].length) {
                    picked.push(pools[p][round]);
                    tookAny = true;
                }
            }
            if (!tookAny) { break; }   /* every pool exhausted */
            round++;
        }
        return shuffle(picked);
    }

    /* A lost question's awards are kept but not counted (scan 18 Nov
       evening): a Rule Out on the right answer used to delete them, so
       taking that Rule Out back restored the question but not the points
       the host had already given. */
    function scoreOf(playerId) {
        var n = state.adjust[playerId] || 0;
        for (var k in state.awards) {
            if (Object.prototype.hasOwnProperty.call(state.awards, k)) {
                if (lostAt(k)) { continue; }
                if (state.awards[k].indexOf(playerId) !== -1) { n++; }
            }
        }
        return n;
    }

    /* The keyboard's place, kept across a redraw (scan 18 Nov evening).
       Picking an answer, giving a point or pressing −/+ rebuilds the
       buttons, and the one with focus went with them, so focus fell to the
       page and Tab started again from the top. Each rebuilt button carries
       a data-fk naming what it is (not where it sits: the scoreboard
       re-sorts), and the same one in the new markup gets focus back. */
    function focusKey(box) {
        var a = document.activeElement;
        return (a && a !== box && box.contains(a) && a.dataset) ? (a.dataset.fk || null) : null;
    }

    function restoreFocus(box, key, fallback) {
        if (!key) { return; }
        var again = box.querySelector('[data-fk="' + key + '"]');
        var to = (again && !again.disabled) ? again
            : (box.querySelector('button:not(:disabled)') || fallback || null);
        if (to && !to.disabled) { to.focus({ preventScroll: true }); }
    }

    function standings() {
        return state.players
            .map(function (p) { return { id: p.id, name: p.name, score: scoreOf(p.id) }; })
            .sort(function (a, b) {
                if (b.score !== a.score) { return b.score - a.score; }
                return a.name.localeCompare(b.name);
            });
    }

    /* ================================================================ setup
       ============================================================== */

    function renderPlayers() {
        el.players.innerHTML = '';

        draft.players.forEach(function (p) {
            var li = document.createElement('li');

            var name = document.createElement('span');
            name.className = 'qz-chip-name';
            name.textContent = p.name;
            li.appendChild(name);

            var x = document.createElement('button');
            x.type = 'button';
            x.setAttribute('aria-label', 'Remove ' + p.name);
            x.textContent = '×';
            x.addEventListener('click', function () {
                draft.players = draft.players.filter(function (q) { return q.id !== p.id; });
                renderPlayers();
            });
            li.appendChild(x);

            el.players.appendChild(li);
        });

        el.playersEmpty.hidden = draft.players.length > 0;
        el.playerCount.textContent = String(draft.players.length);
        refreshStart();
    }

    function renderCats() {
        el.cats.innerHTML = '';

        CATS.forEach(function (c) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'qz-cat';
            var on = draft.cats.indexOf(c.id) !== -1;
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');

            var icon = document.createElement('span');
            icon.className = 'qz-cat-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = c.icon || '';
            btn.appendChild(icon);

            var label = document.createElement('span');
            label.className = 'qz-cat-label';
            label.textContent = c.label;
            btn.appendChild(label);

            var tick = document.createElement('span');
            tick.className = 'qz-cat-tick';
            tick.setAttribute('aria-hidden', 'true');
            tick.textContent = '✓';
            btn.appendChild(tick);

            btn.addEventListener('click', function () {
                var at = draft.cats.indexOf(c.id);
                if (at === -1) { draft.cats.push(c.id); } else { draft.cats.splice(at, 1); }
                btn.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
                refreshCatNote();
                refreshStart();
            });

            el.cats.appendChild(btn);
        });

        refreshCatNote();
    }

    /* Says how many questions are left that this device has never asked, not
       how many exist. That is the number which decides whether the round the
       host is about to start is the length they picked, and it is the only
       place the never-repeat rule is visible until it bites. */
    function refreshCatNote() {
        if (!draft.cats.length) {
            el.catNote.textContent = 'Pick at least one category.';
            el.catReset.hidden = true;
            el.catAll.textContent = 'All';
            return;
        }

        var fresh = freshCount(draft.cats);
        var total = totalCount(draft.cats);
        var used = total - fresh;

        var msg = fresh.toLocaleString() + ' unasked question' + (fresh === 1 ? '' : 's') +
            ' in ' + draft.cats.length + (draft.cats.length === 1 ? ' category' : ' categories') + '.';
        if (used > 0) {
            msg += ' ' + used.toLocaleString() + ' already used.';
        }
        if (!fresh) {
            msg = 'Every question in these categories has been asked. Reset to use them again.';
        }
        el.catNote.textContent = msg;

        /* The reset only appears once there is something to reset — in the
           categories picked or in the Christmas bank. */
        var xUsed = totalCount([XMAS]) - freshCount([XMAS]);
        el.catReset.hidden = used + xUsed === 0;
        el.catAll.textContent = draft.cats.length === CATS.length ? 'None' : 'All';
        refreshXmasNote();
    }

    function refreshXmasNote() {
        var fresh = freshCount([XMAS]);
        el.xmasNote.textContent = fresh
            ? 'Every other question is a Christmas one. ' + fresh.toLocaleString() + ' unasked.'
            : 'Every Christmas question has been asked. Reset to use them again.';
    }

    function refreshStart() {
        el.start.disabled = !(draft.players.length && draft.cats.length);
    }

    el.addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = el.addName.value.trim().replace(/\s+/g, ' ');
        if (!name) { return; }

        /* Two players called "Dave" is a scoreboard nobody can read, so the
           second one is nudged rather than silently accepted. */
        /* The typed name stays in the box and the warning goes under it, in
           the existing player's own spelling (scan 18 Nov evening): it used
           to empty the box and say "Already got a alice" in the placeholder. */
        var clash = null;
        draft.players.forEach(function (p) {
            if (!clash && p.name.toLowerCase() === name.toLowerCase()) { clash = p; }
        });
        if (clash) {
            el.addHint.textContent = 'Already got ' + clash.name + '. Try another name.';
            el.addHint.hidden = false;
            el.addName.focus();
            el.addName.select();
            return;
        }

        draft.players.push({ id: 'p' + Date.now() + Math.floor(Math.random() * 1000), name: name });
        el.addName.value = '';
        el.addHint.hidden = true;
        renderPlayers();
        el.addName.focus();
    });

    el.addName.addEventListener('input', function () { el.addHint.hidden = true; });

    /* Forgets what this device has asked. Deliberately a confirm and not a
       quiet toggle: it is the one control that can make a question repeat,
       which is the behaviour the host asked to be rid of. Scoped to ALL
       categories rather than the selected ones — a per-category reset sounds
       tidier but means the host has to reason about which subset they last
       cleared, and the history is one list. */
    el.catReset.addEventListener('click', function () {
        var every = CATS.map(function (c) { return c.id; }).concat([XMAS]);
        var used = totalCount(every) - freshCount(every);
        if (!used) { return; }
        if (!window.confirm('Forget the ' + used.toLocaleString() +
            ' question' + (used === 1 ? '' : 's') +
            ' already asked on this device?\n\nThey will start coming up again.')) { return; }
        asked = Object.create(null);
        saveAsked();
        refreshCatNote();
    });

    el.catAll.addEventListener('click', function () {
        draft.cats = draft.cats.length === CATS.length
            ? []
            : CATS.map(function (c) { return c.id; });
        renderCats();
        refreshStart();
    });

    el.length.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-len]');
        if (!btn) { return; }
        draft.length = parseInt(btn.dataset.len, 10);
        Array.prototype.forEach.call(el.length.children, function (b) {
            b.classList.toggle('is-on', b === btn);
        });
    });

    el.optTest.addEventListener('change', function () {
        try { localStorage.setItem(TEST_KEY, el.optTest.checked ? '1' : '0'); } catch (err) { /* fine */ }
    });

    el.optXmas.addEventListener('change', function () {
        draft.xmas = el.optXmas.checked;
    });

    el.start.addEventListener('click', function () {
        /* A saved quiz is still offered above (Resume). Starting a new one
           writes over it, scores and all, so ask first (18 Nov 2026 scan:
           it used to go without a word). */
        if (!el.resume.hidden && !window.confirm('Start a new quiz? The quiz in progress and its scores will be lost.')) { return; }
        startQuiz(draft.players.slice(), draft.cats.slice(), draft.length, draft.xmas);
    });

    /* ================================================================= play
       ============================================================== */

    function startQuiz(players, cats, length, xmas) {
        /* Carried from the quiz before, when there was one: "another round"
           should not switch Lock in first off. */
        var keep = state ? { suspense: state.suspense, keepAwake: state.keepAwake } : null;

        var order = drawQuestions(cats, length, xmas);

        /* Nothing left that has not been asked. Say so plainly and offer the
           one thing that fixes it, rather than starting an empty quiz or
           silently repeating. */
        if (!order.length) {
            window.alert('Every question in these categories has already been asked on this device.\n\nPick more categories, or use "Reset asked" to make them available again.');
            return;
        }

        /* A Christmas quiz with no Christmas questions left would start as
           an ordinary one and say nothing. */
        if (xmas && !freshCount([XMAS])) {
            window.alert('Every Christmas question has already been asked on this device.\n\nUse "Reset asked" to make them available again, or switch the Christmas quiz off.');
            return;
        }

        /* Short of what was asked for. Better to say so up front than to have
           the host discover it when "Question 12 of 12" appears mid-round. */
        if (length && order.length < length) {
            /* In a Christmas quiz the short side may be the Christmas bank,
               not the categories, and the message should say which (scan 18
               Nov evening). The Christmas half wants floor(length / 2). */
            var xFresh = xmas ? freshCount([XMAS]) : 0;
            var xShort = xmas && xFresh < Math.floor(length / 2);
            var why = xShort
                ? 'Only ' + xFresh + ' unasked Christmas question' + (xFresh === 1 ? '' : 's') +
                  ' left, so the round can only be ' + order.length + ' long, not ' + length + '.'
                : 'Only ' + order.length + ' unasked question' +
                  (order.length === 1 ? '' : 's') + ' left in these categories, not ' + length + '.';
            var go = window.confirm(why + '\n\nStart a shorter round of ' + order.length + '?');
            if (!go) { return; }
        }

        state = blankState();
        state.players = players;
        state.cats = cats;
        state.length = length;
        state.order = order;
        state.xmas = !!xmas;
        state.test = !!el.optTest.checked;
        if (keep) {
            state.suspense = !!keep.suspense;
            state.keepAwake = keep.keepAwake !== false;
        }

        save();
        /* The saved quiz the resume card offered has just been written over. */
        el.resume.hidden = true;
        showPlay();
    }

    /* ------------------------------------------------------- soundboard */

    /* THE QUIZ MAKES NO SOUND BY ITSELF (16 Nov 2026, the host's call, after
       a first version that played a sting on every tap). Starting, locking
       in, revealing, a lifeline, finishing: all silent. Every cue is a
       button on the soundboard, pressed by the host when the moment wants
       it, and the two loops run until their buttons are pressed again.
       Nothing below may call the audio engine except a press on the board,
       and stopSound() when the quiz itself is thrown away. */
    var boards = document.querySelectorAll('[data-sounds]');

    function buildBoards() {
        if (!SOUND) { return; }
        /* A loop whose file will not load lets go of itself; the board is
           told, so its button does not stay lit as if playing (scan 18 Nov
           evening). */
        SOUND.onchange = paintBoards;
        Array.prototype.forEach.call(boards, function (board) {
            SOUND.cues.forEach(function (cue) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'qz-snd' + (cue.loop ? ' is-loop' : '');
                btn.dataset.snd = cue.id;
                btn.textContent = cue.label;
                if (cue.loop) { btn.setAttribute('aria-pressed', 'false'); }
                board.appendChild(btn);
            });
            board.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-snd]');
                if (!btn) { return; }
                SOUND.setFestive(!!(state && state.xmas));
                SOUND.press(btn.dataset.snd);
                paintBoards();
            });
        });
    }

    /* Lights the button of whichever loop is running, on both boards. */
    function paintBoards() {
        var on = SOUND ? SOUND.looping() : '';
        Array.prototype.forEach.call(document.querySelectorAll('.qz-snd.is-loop'), function (btn) {
            var lit = btn.dataset.snd === on;
            btn.classList.toggle('is-on', lit);
            btn.setAttribute('aria-pressed', lit ? 'true' : 'false');
        });
    }

    function stopSound() {
        if (SOUND) { try { SOUND.stop(); } catch (err) {} }
        paintBoards();
    }

    function showScreen(which) {
        el.setup.hidden = which !== 'setup';
        el.play.hidden = which !== 'play';
        el.done.hidden = which !== 'done';
        window.scrollTo(0, 0);
    }

    function showPlay() {
        showScreen('play');
        el.optWake.checked = state.keepAwake !== false;
        /* The soundboard's recordings are fetched now, as the quiz opens, so
           the first press of a cue is prompt. Fetching makes no sound. */
        if (SOUND && SOUND.preload) { SOUND.preload(); }
        renderQuestion();
        if (state.keepAwake !== false) { requestWakeLock(); }
    }

    function renderQuestion(dir) {
        var total = state.order.length;
        var i = state.idx;
        var item = questionAt(i);

        /* A saved quiz whose bank has since been edited can point at a
           question that no longer exists. Skip rather than crash — a host
           mid-round will never know. In the direction of travel (scan 18
           Nov evening): Back always skipped forward again, so it could
           never get past a removed question. Back that runs out of earlier
           questions turns round and goes forward. */
        if (!item) {
            if (dir === -1) {
                for (var b = i - 1; b >= 0; b--) {
                    if (questionAt(b)) { state.idx = b; save(); renderQuestion(-1); return; }
                }
            }
            for (var f = i + 1; f < total; f++) {
                if (questionAt(f)) { state.idx = f; save(); renderQuestion(1); return; }
            }
            finish();
            return;
        }

        el.progressFill.style.width = (((i + 1) / total) * 100) + '%';
        el.progressText.textContent = (state.test ? 'Test · ' : '') + 'Question ' + (i + 1) + ' of ' + total;
        el.progressText.classList.toggle('is-test', !!state.test);
        el.catPill.textContent = catLabel(item.cat);
        el.catPill.classList.toggle('is-xmas', item.cat === XMAS);
        el.question.textContent = item.q;

        /* The order the four answers sit in is drawn once, the first time
           the question is shown, and saved: going Back, or reopening the tab
           mid-question, must not move B to where D was after the host has
           read them out. */
        if (!state.shuf[i] || state.shuf[i].length !== 4) {
            state.shuf[i] = shuffle([0, 1, 2, 3]);
            save();
        }

        /* Marked as asked when it is PUT IN FRONT OF THE HOST, not when the
           round was drawn. A host who sets up a 40-question round, asks three
           and abandons it has burned three questions, not forty. Going back
           and forward over the same question is harmless — it is a set. */
        markAsked(state.order[i]);

        /* Back is off when every question before this one is gone too. */
        var earlier = false;
        for (var e = i - 1; e >= 0 && !earlier; e--) { if (questionAt(e)) { earlier = true; } }
        el.prev.disabled = !earlier;
        el.next.textContent = (i + 1 === total) ? 'Finish' : 'Next';

        renderOptions();
        renderAwards();
        el.stage.scrollTop = 0;
    }

    /* ------------------------------------------------------- the answers */

    /* Right answer found, by a tap or by the host asking to be shown it. */
    function solved(i) {
        return !!state.shown[i] || lostAt(i) || (state.picks[i] || []).indexOf(0) !== -1;
    }

    /* The question was thrown away: a player used Rule Out on the RIGHT
       answer. It is over for everyone and nobody scores (the host's rule,
       16 Nov 2026). Counted as solved so that everything which closes when
       the answer is showing closes here too. */
    function lostAt(i) {
        var r = state.rule[i] || {};
        return Object.keys(r).some(function (pid) { return r[pid] === 0; });
    }

    function renderOptions() {
        var i = state.idx;
        var item = questionAt(i);
        if (!item) { return; }

        var picks = state.picks[i] || [];
        var gone = goneAt(i);
        var done = solved(i);
        var locked = state.lock[i];
        var fk = focusKey(el.opts);

        el.opts.innerHTML = '';

        state.shuf[i].forEach(function (place, row) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'qz-opt';
            btn.dataset.fk = 'o' + place;

            var letter = document.createElement('span');
            letter.className = 'qz-opt-letter';
            letter.textContent = LETTERS[row];
            btn.appendChild(letter);

            var text = document.createElement('span');
            text.className = 'qz-opt-text';
            text.textContent = item.opts[place];
            btn.appendChild(text);

            var picked = picks.indexOf(place) !== -1;
            var status = '';
            if (place === 0 && lostAt(i)) { btn.classList.add('is-lost'); status = 'the right answer, ruled out'; }
            else if (place === 0 && done) { btn.classList.add('is-right'); status = 'correct'; }
            else if (picked) { btn.classList.add('is-wrong'); status = 'wrong'; }
            else if (gone.indexOf(place) !== -1) { btn.classList.add('is-gone'); status = 'removed'; }
            else if (locked === place) { btn.classList.add('is-locked'); status = 'locked in'; }

            /* Spent answers cannot be tapped again; nor can anything once
               the right one is showing. */
            btn.disabled = done || picked || gone.indexOf(place) !== -1;
            btn.setAttribute('aria-label', LETTERS[row] + ': ' + item.opts[place] + (status ? ', ' + status : ''));

            btn.addEventListener('click', function () { tapOption(place); });
            el.opts.appendChild(btn);
        });

        el.suspense.setAttribute('aria-pressed', state.suspense ? 'true' : 'false');
        el.reveal.hidden = locked === undefined || done;
        el.show.hidden = done;
        renderBanner();
        /* Once the answer is showing every option is off; Next is where the
           host is going. */
        restoreFocus(el.opts, fk, el.next);
    }

    function tapOption(place) {
        var i = state.idx;
        if (solved(i)) { return; }
        if ((state.picks[i] || []).indexOf(place) !== -1) { return; }
        if (goneAt(i).indexOf(place) !== -1) { return; }

        /* A Rule Out waiting on its answer takes the next tap. It is not a
           guess and scores nothing: it only records which answer was named,
           and the screen then says whether that one is wrong. */
        var who = ruleWaiting(i);
        if (who) {
            state.rule[i][who] = place;
            /* The question's awards are left alone: scoreOf skips a lost
               question, so taking the Rule Out back gives them back. */
            if (place === 0) { delete state.lock[i]; }
            if (place !== 0 && state.lock[i] === place) { delete state.lock[i]; }
            save();
            renderOptions();
            renderAwards();
            if (navigator.vibrate) { navigator.vibrate(place === 0 ? [20, 60, 20] : 30); }
            return;
        }

        /* Lock in first: the first tap only locks the answer in, amber, and
           makes no sound. Tapping the locked answer again, or Reveal, shows it;
           tapping a different one moves the lock, for when the room changes
           its mind before the host has let go. */
        if (state.suspense && state.lock[i] !== place) {
            state.lock[i] = place;
            save();
            renderOptions();
            if (navigator.vibrate) { navigator.vibrate(12); }
            return;
        }

        revealPick(place);
    }

    function revealPick(place) {
        var i = state.idx;
        delete state.lock[i];

        var picks = state.picks[i] ? state.picks[i].slice() : [];
        picks.push(place);
        state.picks[i] = picks;
        save();
        renderOptions();
        renderAwards();

        /* One buzz for right, two for wrong: the host can feel which it was
           with their eyes on the room. Ignored where unsupported, and iOS
           has never supported it. */
        if (navigator.vibrate) { navigator.vibrate(place === 0 ? 30 : [20, 60, 20]); }
    }

    el.reveal.addEventListener('click', function () {
        var place = state.lock[state.idx];
        if (place !== undefined) { revealPick(place); }
    });

    /* Nobody in the room knows, or they have had enough guesses. Shows the
       right answer without it being anybody's pick, and without a sting:
       nobody got anything right. */
    el.show.addEventListener('click', function () {
        var i = state.idx;
        if (solved(i)) { return; }
        delete state.lock[i];
        state.shown[i] = true;
        save();
        renderOptions();
        renderAwards();
    });

    el.suspense.addEventListener('click', function () {
        state.suspense = !state.suspense;
        /* Switching it off with an answer locked in lets that answer go:
           the next tap reveals at once, as it says. */
        if (!state.suspense) { delete state.lock[state.idx]; }
        save();
        renderOptions();
    });

    /* ---------------------------------------------------------- lifelines */

    function lifeOf(playerId) {
        return state.life[playerId] || {};
    }

    /* Rule Out. The player names one answer they believe is wrong and the
       host taps it. If it IS wrong it is struck out, like a 50:50 that
       takes one. If it is the RIGHT answer, it is ruled out all the same
       and the question is lost: over for everyone, nobody scores. That is
       the host's rule and the lifeline's gamble. (The first version left
       the right answer standing and said so, which simply told the player
       what it was, and made this the strongest lifeline of the three.) */
    function ruleWaiting(i) {
        var r = state.rule[i] || {};
        for (var k = 0; k < state.players.length; k++) {
            if (r[state.players[k].id] === null) { return state.players[k].id; }
        }
        return '';
    }

    /* Every answer off the board for this question: 50:50's two, and any
       wrong one a player has ruled out. */
    function goneAt(i) {
        var out = (state.fifty[i] || []).slice();
        var r = state.rule[i] || {};
        Object.keys(r).forEach(function (pid) {
            if (typeof r[pid] === 'number' && r[pid] !== 0 && out.indexOf(r[pid]) === -1) { out.push(r[pid]); }
        });
        return out;
    }

    function letterOf(i, place) {
        return LETTERS[(state.shuf[i] || []).indexOf(place)] || '';
    }

    /* Who is on a lifeline for this question, said plainly above the names:
       the host is running a room and should not have to remember it. */
    function renderBanner() {
        var i = state.idx;
        var lines = [];
        state.players.forEach(function (p) {
            var mine = lifeOf(p.id);
            LIFELINES.forEach(function (l) {
                if (mine[l.id] !== i) { return; }
                if (l.id === 'fifty') { lines.push(p.name + ' played 50:50. Two wrong answers are gone.'); }
                if (l.id === 'host') { lines.push(p.name + ' asks the host. Say which one you would pick.'); }
                if (l.id === 'rule') {
                    var named = (state.rule[i] || {})[p.id];
                    if (named === null || named === undefined) {
                        lines.push(p.name + ' plays Rule Out. Tap the answer ' + p.name + ' thinks is wrong.');
                    } else if (named === 0) {
                        lines.push(p.name + ' ruled out ' + letterOf(i, named) + ', the right answer. Question lost: nobody scores.');
                    } else {
                        lines.push(p.name + ' ruled out ' + letterOf(i, named) + '. It was wrong.');
                    }
                }
            });
        });
        el.banner.hidden = !lines.length;
        el.banner.textContent = lines.join(' ');
    }

    function fiftyInPlay(i) {
        return state.players.some(function (p) { return lifeOf(p.id).fifty === i; });
    }

    function tapLifeline(playerId, id) {
        var i = state.idx;
        var mine = state.life[playerId] ? Object.assign({}, state.life[playerId]) : {};
        var usedOn = mine[id];

        if (usedOn === undefined) {
            /* Nothing to be helped with once the answer is showing. */
            if (solved(i)) { return; }
            mine[id] = i;
            state.life[playerId] = mine;

            if (id === 'rule') {
                var waiting = state.rule[i] ? Object.assign({}, state.rule[i]) : {};
                waiting[playerId] = null;
                state.rule[i] = waiting;
            }

            if (id === 'fifty' && !state.fifty[i]) {
                /* Two wrong answers go. Not one already tapped and red, not
                   one already ruled out, and not the one locked in, while
                   there are others to take. */
                var picks = state.picks[i] || [];
                var ruled = goneAt(i);
                var wrong = shuffle([1, 2, 3]).sort(function (a, b) {
                    var ka = (picks.indexOf(a) !== -1 || ruled.indexOf(a) !== -1 || state.lock[i] === a) ? 1 : 0;
                    var kb = (picks.indexOf(b) !== -1 || ruled.indexOf(b) !== -1 || state.lock[i] === b) ? 1 : 0;
                    return ka - kb;
                });
                state.fifty[i] = wrong.slice(0, 2);
                if (state.fifty[i].indexOf(state.lock[i]) !== -1) { delete state.lock[i]; }
            }
        } else if (usedOn === i) {
            /* A mis-tap, taken back on the question it was made on. */
            delete mine[id];
            state.life[playerId] = mine;
            if (id === 'fifty' && !fiftyInPlay(i)) { delete state.fifty[i]; }
            if (id === 'rule' && state.rule[i]) {
                var left = Object.assign({}, state.rule[i]);
                delete left[playerId];
                state.rule[i] = left;
            }
        } else {
            /* Spent on an earlier question. Going Back to that question is
               how it is undone. */
            return;
        }

        save();
        renderOptions();
        renderAwards();
        if (navigator.vibrate) { navigator.vibrate(12); }
    }

    /* ------------------------------------------------------------ players */

    function renderAwards() {
        var i = state.idx;
        var given = state.awards[i] || [];
        var done = solved(i);
        var lost = lostAt(i);
        var fk = focusKey(el.awardGrid);

        el.awardGrid.innerHTML = '';

        state.players.forEach(function (p) {
            var row = document.createElement('div');
            row.className = 'qz-award-row';

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'qz-award-btn';
            btn.dataset.fk = 'a' + p.id;
            /* A lost question's points are held, not shown (see scoreOf). */
            var on = !lost && given.indexOf(p.id) !== -1;
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.disabled = lostAt(i);

            var name = document.createElement('span');
            name.className = 'qz-award-name';
            name.textContent = p.name;
            btn.appendChild(name);

            var score = document.createElement('span');
            score.className = 'qz-award-score';
            score.textContent = String(scoreOf(p.id));
            btn.appendChild(score);

            btn.addEventListener('click', function () {
                toggleAward(p.id);
            });
            row.appendChild(btn);

            var mine = lifeOf(p.id);
            LIFELINES.forEach(function (l) {
                var lb = document.createElement('button');
                lb.type = 'button';
                lb.className = 'qz-life';
                lb.dataset.fk = 'l' + p.id + '-' + l.id;
                lb.textContent = l.label;
                var usedOn = mine[l.id];
                var word = 'ready';
                if (usedOn === i) { lb.classList.add('is-live'); word = 'in use on this question'; }
                else if (usedOn !== undefined) { lb.classList.add('is-spent'); lb.disabled = true; word = 'used'; }
                else if (done) { lb.disabled = true; }
                lb.setAttribute('aria-label', l.name + ' for ' + p.name + ', ' + word);
                lb.addEventListener('click', function () { tapLifeline(p.id, l.id); });
                row.appendChild(lb);
            });

            el.awardGrid.appendChild(row);
        });
        restoreFocus(el.awardGrid, fk, el.next);
    }

    function toggleAward(playerId) {
        var i = state.idx;
        if (lostAt(i)) { return; }
        var given = state.awards[i] ? state.awards[i].slice() : [];
        var at = given.indexOf(playerId);

        if (at === -1) { given.push(playerId); } else { given.splice(at, 1); }

        if (given.length) { state.awards[i] = given; } else { delete state.awards[i]; }

        save();
        renderAwards();

        /* A short buzz confirms the tap without the host having to look down
           at the screen to check it registered. Ignored where unsupported,
           and iOS has never supported it — hence it being a nicety and not
           the only feedback. */
        if (navigator.vibrate) { navigator.vibrate(12); }
    }

    /* Leaving a question lets go of anything locked in on it and ends the
       wait: it belongs to the question it was started on. Any loop on the
       soundboard plays on; that is the host's to stop. */
    function leaveQuestion() {
        delete state.lock[state.idx];
    }

    el.prev.addEventListener('click', function () {
        if (state.idx === 0 || el.prev.disabled) { return; }
        leaveQuestion();
        state.idx--;
        save();
        renderQuestion(-1);
    });

    el.next.addEventListener('click', function () {
        leaveQuestion();
        if (state.idx + 1 >= state.order.length) { finish(); return; }
        state.idx++;
        save();
        renderQuestion(1);
    });

    /* ================================================================= end
       ============================================================== */

    function finish() {
        delete state.lock[state.idx];
        state.phase = 'done';
        save();
        renderFinal();
        showScreen('done');
        releaseWakeLock();
    }

    function renderFinal() {
        var rows = standings();
        el.final.innerHTML = '';

        var lastScore = null;
        var lastRank = 0;
        /* Nobody scored, nobody won: no trophies (scan 18 Nov evening). A
           round where every player is on 0 used to give every one of them
           the cup. */
        var anyScore = rows.length && rows[0].score > 0;

        rows.forEach(function (r, i) {
            /* Equal scores share a rank — two people on 9 are both 2nd, and
               announcing one of them as 3rd at the end of the night is the
               sort of thing that starts an argument. */
            var rank = (r.score === lastScore) ? lastRank : i + 1;
            lastScore = r.score;
            lastRank = rank;
            var won = rank === 1 && anyScore;

            var li = document.createElement('li');
            if (won) { li.className = 'is-winner'; }

            var n = document.createElement('span');
            n.className = 'qz-rank';
            n.textContent = won ? '\u{1F3C6}' : String(rank);
            li.appendChild(n);

            var name = document.createElement('span');
            name.className = 'qz-final-name';
            name.textContent = r.name;
            li.appendChild(name);

            var s = document.createElement('span');
            s.className = 'qz-final-score';
            s.textContent = String(r.score);
            li.appendChild(s);

            el.final.appendChild(li);
        });
    }

    el.again.addEventListener('click', function () {
        /* Same people, same categories, same length — a fresh draw and the
           scores back to nothing. The questions already asked ARE excluded:
           startQuiz draws through drawQuestions, which skips anything in
           `asked`, so a second round is new questions rather than a reshuffle
           of the first. When a category runs dry it simply gives fewer, and
           the setup card's reset is how the bank is opened up again. */
        startQuiz(state.players.slice(), state.cats.slice(), state.length, state.xmas);
    });

    el.newQuiz.addEventListener('click', function () {
        abandon();
    });

    function abandon() {
        clearStore();
        stopSound();
        state = null;
        releaseWakeLock();
        closeSheets();
        el.resume.hidden = true;
        /* The setup card was last drawn before this quiz ran, so its unasked
           count and its reset button are both stale by however many questions
           were just read out. Redraw before showing it again. */
        refreshCatNote();
        showScreen('setup');
    }

    /* ============================================================== sheets
       ============================================================== */

    /* The keyboard goes into a sheet as it opens and back to the button that
       opened it as it shuts (18 Nov 2026 scan): it used to stay behind the
       backdrop, tabbing through the question under it. */
    var sheetOpener = null;

    function openSheet(node) {
        closeSheets();
        sheetOpener = document.activeElement;
        el.backdrop.hidden = false;
        node.hidden = false;
        var done = node.querySelector('.qz-sheet-head .qz-mini');
        if (done) { done.focus({ preventScroll: true }); }
    }

    function closeSheets() {
        var was = !el.sheet.hidden || !el.menu.hidden;
        el.backdrop.hidden = true;
        el.sheet.hidden = true;
        el.menu.hidden = true;
        var back = sheetOpener;
        sheetOpener = null;
        if (was && back && back.isConnected && !back.closest('[hidden]')) { back.focus({ preventScroll: true }); }
    }

    el.scoreBtn.addEventListener('click', function () {
        renderBoard();
        openSheet(el.sheet);
    });

    el.menuBtn.addEventListener('click', function () { openSheet(el.menu); });
    el.sheetClose.addEventListener('click', closeSheets);
    el.menuClose.addEventListener('click', closeSheets);
    el.backdrop.addEventListener('click', closeSheets);

    function openSheetNode() {
        if (!el.sheet.hidden) { return el.sheet; }
        if (!el.menu.hidden) { return el.menu; }
        return null;
    }

    /* The sheets are dialogs (role="dialog" aria-modal="true" in
       quiz.html), so Tab goes round inside the open one rather than out to
       the question under the backdrop (scan 18 Nov evening). */
    function trapTab(e, sheet) {
        var list = Array.prototype.filter.call(
            sheet.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'),
            function (n) { return !n.disabled && n.getClientRects().length; });
        if (!list.length) { return; }
        var first = list[0];
        var last = list[list.length - 1];
        var at = document.activeElement;
        if (e.shiftKey && (at === first || !sheet.contains(at))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (at === last || !sheet.contains(at))) { e.preventDefault(); first.focus(); }
    }

    /* Keys for a host on a laptop (scan 18 Nov evening): A to D (or 1 to
       4) tap that answer, the arrow keys are Back and Next (N is Next too;
       B is an answer, so Back has no letter), and Enter reveals a locked-in
       answer. Each goes through the button's own click, so it does exactly
       what a tap does. Not while typing, not with a sheet open, not with a
       modifier held, and Enter only when focus is not already on a button
       (where Enter presses that button). */
    function playKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) { return; }
        if (!state || el.play.hidden || openSheetNode()) { return; }
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { return; }
        var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        var row = 'abcd'.indexOf(k);
        if (row === -1 && k >= '1' && k <= '4') { row = +k - 1; }
        var hit = null;
        if (row !== -1 && k.length === 1) { hit = el.opts.children[row] || null; }
        else if (k === 'ArrowRight' || k === 'n') { hit = el.next; }
        else if (k === 'ArrowLeft') { hit = el.prev; }
        else if (k === 'Enter' && !(t && t.closest && t.closest('button'))) { hit = el.reveal.hidden ? null : el.reveal; }
        if (!hit || hit.disabled) { return; }
        e.preventDefault();
        hit.click();
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeSheets(); return; }
        var sheet = openSheetNode();
        if (e.key === 'Tab' && sheet) { trapTab(e, sheet); return; }
        playKey(e);
    });

    function renderBoard() {
        var rows = standings();
        var fk = focusKey(el.board);
        el.board.innerHTML = '';

        var lastScore = null;
        var lastRank = 0;

        rows.forEach(function (r, i) {
            var rank = (r.score === lastScore) ? lastRank : i + 1;
            lastScore = r.score;
            lastRank = rank;

            var li = document.createElement('li');

            var n = document.createElement('span');
            n.className = 'qz-rank';
            n.textContent = String(rank);
            li.appendChild(n);

            var name = document.createElement('span');
            name.className = 'qz-board-name';
            name.textContent = r.name;
            li.appendChild(name);

            var minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'qz-adjust';
            minus.dataset.fk = 'm' + r.id;
            minus.setAttribute('aria-label', 'Take a point from ' + r.name);
            minus.textContent = '−';
            minus.addEventListener('click', function () { adjust(r.id, -1); });
            li.appendChild(minus);

            var s = document.createElement('span');
            s.className = 'qz-board-score';
            s.textContent = String(r.score);
            li.appendChild(s);

            var plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'qz-adjust';
            plus.dataset.fk = 'p' + r.id;
            plus.setAttribute('aria-label', 'Give a point to ' + r.name);
            plus.textContent = '+';
            plus.addEventListener('click', function () { adjust(r.id, 1); });
            li.appendChild(plus);

            el.board.appendChild(li);
        });
        restoreFocus(el.board, fk, el.sheetClose);
    }

    /* A manual correction is kept SEPARATE from the per-question awards
       rather than folded into them: an award belongs to a question and has to
       survive the host going back to that question, whereas a correction
       belongs to nothing in particular. Mixing them would mean a Back-and-
       untap silently wiping a hand-made adjustment. */
    function adjust(playerId, delta) {
        var now = (state.adjust[playerId] || 0) + delta;

        /* Not below zero overall — a negative score is almost always a
           mis-tap rather than an intention. */
        if (scoreOf(playerId) + delta < 0) { return; }

        if (now === 0) { delete state.adjust[playerId]; } else { state.adjust[playerId] = now; }
        save();
        renderBoard();
        if (!el.play.hidden) { renderAwards(); }
    }


    el.optWake.addEventListener('change', function () {
        state.keepAwake = el.optWake.checked;
        save();
        if (state.keepAwake) { requestWakeLock(); } else { releaseWakeLock(); }
    });

    el.menuFinish.addEventListener('click', function () {
        closeSheets();
        finish();
    });

    el.menuAbandon.addEventListener('click', function () {
        if (window.confirm('Throw this quiz away and start again? The scores will be lost.')) {
            abandon();
        }
    });

    /* =========================================================== wake lock
       ============================================================== */

    /* Keeps the screen on while the host is reading. Screen Wake Lock is
       dropped by the browser whenever the page is hidden — that is the spec,
       not a bug — so it has to be taken again every time the tab comes back,
       otherwise it works until the first time the host checks a message and
       never again. */
    var wakeLock = null;

    function requestWakeLock() {
        if (!('wakeLock' in navigator) || wakeLock || document.hidden) { return; }
        navigator.wakeLock.request('screen').then(function (lock) {
            wakeLock = lock;
            lock.addEventListener('release', function () { wakeLock = null; });
        }).catch(function () {
            /* Refused (low battery, unsupported, not a user gesture). The
               quiz is entirely unaffected; the screen just dims as normal. */
        });
    }

    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release().catch(function () {});
            wakeLock = null;
        }
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            /* The last chance to write before the tab can be evicted. */
            save();
        } else if (state && state.phase === 'play' && state.keepAwake !== false && !el.play.hidden) {
            requestWakeLock();
        }
    });

    /* pagehide fires where unload does not — bfcache, iOS closing the tab —
       and is the recommended last write. save() is cheap and idempotent, so
       running it here as well as on every mutation costs nothing. */
    window.addEventListener('pagehide', save);

    /* ================================================================ boot
       ============================================================== */

    function describe(saved) {
        var names = saved.players.map(function (p) { return p.name; });
        var who = names.length <= 3
            ? names.join(', ')
            : names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more';
        if (saved.phase === 'done') {
            return who + ' · finished, scores still here';
        }
        return who + ' · question ' + Math.min(saved.idx + 1, saved.order.length) +
               ' of ' + saved.order.length;
    }

    function boot() {
        /* Index first: renderCats and refreshCatNote both read BY_CAT. */
        buildIndex();
        loadAsked();

        renderPlayers();
        renderCats();
        buildBoards();
        el.optTest.checked = testWanted();

        var saved = load();
        if (saved) {
            el.resumeDetail.textContent = describe(saved);
            el.resume.hidden = false;

            el.resumeGo.addEventListener('click', function () {
                state = saved;
                el.resume.hidden = true;
                if (state.phase === 'done') {
                    renderFinal();
                    showScreen('done');
                } else {
                    showPlay();
                }
            });

            el.resumeDrop.addEventListener('click', function () {
                if (window.confirm('Discard the saved quiz and its scores?')) {
                    clearStore();
                    el.resume.hidden = true;
                }
            });
        }

        showScreen('setup');
    }

    boot();
})();

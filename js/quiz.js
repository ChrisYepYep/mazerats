/* Quiz Night — the host's app at /quiz.
 *
 * One person holds this phone and runs a quiz out loud for a room. That single
 * fact decides nearly every choice below:
 *
 *   - the answer is shown WITH the question, not after it. The host is the
 *     only one looking at the screen, and they need to know the answer at the
 *     moment they finish reading the question, not a tap later. There is a
 *     hide-until-tapped mode in the menu for when the phone gets passed
 *     around, but it is off by default because that is the unusual case.
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
    var STATE_VERSION = 1;

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
        players: $('qz-players'),
        playersEmpty: $('qz-players-empty'),
        playerCount: $('qz-player-count'),

        cats: $('qz-cats'),
        catAll: $('qz-cat-all'),
        catNote: $('qz-cat-note'),

        length: $('qz-length'),
        start: $('qz-start'),

        progressFill: $('qz-progress-fill'),
        progressText: $('qz-progress-text'),
        catPill: $('qz-cat-pill'),
        question: $('qz-question'),
        answer: $('qz-answer'),
        answerText: $('qz-answer-text'),
        reveal: $('qz-reveal'),
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
        optHide: $('qz-opt-hide'),
        optWake: $('qz-opt-wake'),
        menuFinish: $('qz-menu-finish'),
        menuAbandon: $('qz-menu-abandon'),

        final: $('qz-final'),
        again: $('qz-again'),
        newQuiz: $('qz-newquiz')
    };

    var CATS = window.QUIZ_CATEGORIES || [];
    var BANK = window.QUIZ_QUESTIONS || {};

    /* -------------------------------------------------------------- state */

    /* `draft` is what the setup card is building and is NOT the saved quiz —
       a half-filled setup card is not worth restoring over a real quiz in
       progress, and conflating the two is how you end up resuming into a
       screen with no questions in it. */
    var draft = {
        players: [],
        cats: CATS.map(function (c) { return c.id; }),
        length: 25
    };

    var state = null;

    function blankState() {
        return {
            v: STATE_VERSION,
            phase: 'play',
            players: [],
            cats: [],
            order: [],          /* ["music:12", …] in the order they're asked */
            idx: 0,
            awards: {},         /* question index -> [playerId, …]            */
            seen: {},           /* question index -> true, for hidden mode    */
            adjust: {},         /* playerId -> manual +/- correction          */
            hideAnswers: false,
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

        got.awards = got.awards || {};
        got.seen = got.seen || {};
        got.adjust = got.adjust || {};
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
        for (var i = 0; i < CATS.length; i++) {
            if (CATS[i].id === id) { return CATS[i].label; }
        }
        return id;
    }

    function questionAt(i) {
        var key = state.order[i];
        if (!key) { return null; }
        var split = key.lastIndexOf(':');
        var cat = key.slice(0, split);
        var n = parseInt(key.slice(split + 1), 10);
        var row = (BANK[cat] || [])[n];
        if (!row) { return null; }
        return { cat: cat, q: row[0], a: row[1] };
    }

    /* Draws `want` questions spread evenly over the chosen categories rather
       than sampling the combined pool at random — a random sample of a pool
       where one category happens to be bigger gives that category more of the
       round, which is not what "include these categories" means to a host.
       Round-robin first, then shuffle the result so the categories still
       arrive in a jumbled order. */
    function drawQuestions(cats, want) {
        var pools = [];
        cats.forEach(function (id) {
            var rows = BANK[id] || [];
            var keys = rows.map(function (_, i) { return id + ':' + i; });
            if (keys.length) { pools.push(shuffle(keys)); }
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

    function scoreOf(playerId) {
        var n = state.adjust[playerId] || 0;
        for (var k in state.awards) {
            if (Object.prototype.hasOwnProperty.call(state.awards, k)) {
                if (state.awards[k].indexOf(playerId) !== -1) { n++; }
            }
        }
        return n;
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

    function availableCount() {
        return draft.cats.reduce(function (n, id) {
            return n + ((BANK[id] || []).length);
        }, 0);
    }

    function refreshCatNote() {
        var total = availableCount();
        if (!draft.cats.length) {
            el.catNote.textContent = 'Pick at least one category.';
        } else {
            el.catNote.textContent = total + ' questions available in ' +
                draft.cats.length + (draft.cats.length === 1 ? ' category.' : ' categories.');
        }
        el.catAll.textContent = draft.cats.length === CATS.length ? 'None' : 'All';
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
        var clash = draft.players.some(function (p) {
            return p.name.toLowerCase() === name.toLowerCase();
        });
        if (clash) {
            el.addName.value = '';
            el.addName.placeholder = 'Already got a ' + name + ' — try another';
            return;
        }

        draft.players.push({ id: 'p' + Date.now() + Math.floor(Math.random() * 1000), name: name });
        el.addName.value = '';
        el.addName.placeholder = 'Add a player or team…';
        renderPlayers();
        el.addName.focus();
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

    el.start.addEventListener('click', function () {
        startQuiz(draft.players.slice(), draft.cats.slice(), draft.length);
    });

    /* ================================================================= play
       ============================================================== */

    function startQuiz(players, cats, length) {
        state = blankState();
        state.players = players;
        state.cats = cats;
        state.length = length;
        state.order = drawQuestions(cats, length);

        if (!state.order.length) {
            state = null;
            return;
        }

        save();
        showPlay();
    }

    function showScreen(which) {
        el.setup.hidden = which !== 'setup';
        el.play.hidden = which !== 'play';
        el.done.hidden = which !== 'done';
        window.scrollTo(0, 0);
    }

    function showPlay() {
        showScreen('play');
        el.optHide.checked = !!state.hideAnswers;
        el.optWake.checked = state.keepAwake !== false;
        renderQuestion();
        if (state.keepAwake !== false) { requestWakeLock(); }
    }

    function renderQuestion() {
        var total = state.order.length;
        var i = state.idx;
        var item = questionAt(i);

        /* A saved quiz whose bank has since been edited can point at a
           question that no longer exists. Skip rather than crash — a host
           mid-round will never know. */
        if (!item) {
            if (i + 1 < total) { state.idx = i + 1; save(); renderQuestion(); }
            else { finish(); }
            return;
        }

        el.progressFill.style.width = (((i + 1) / total) * 100) + '%';
        el.progressText.textContent = 'Question ' + (i + 1) + ' of ' + total;
        el.catPill.textContent = catLabel(item.cat);
        el.question.textContent = item.q;
        el.answerText.textContent = item.a;

        var hide = state.hideAnswers && !state.seen[i];
        el.answer.classList.toggle('is-hidden', hide);

        el.prev.disabled = i === 0;
        el.next.textContent = (i + 1 === total) ? 'Finish' : 'Next';

        renderAwards();
        el.stage.scrollTop = 0;
    }

    function renderAwards() {
        var i = state.idx;
        var given = state.awards[i] || [];

        el.awardGrid.innerHTML = '';
        el.awardGrid.classList.toggle('is-single', state.players.length === 1);

        state.players.forEach(function (p) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'qz-award-btn';
            var on = given.indexOf(p.id) !== -1;
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');

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

            el.awardGrid.appendChild(btn);
        });
    }

    function toggleAward(playerId) {
        var i = state.idx;
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

    el.reveal.addEventListener('click', function () {
        state.seen[state.idx] = true;
        save();
        el.answer.classList.remove('is-hidden');
    });

    el.prev.addEventListener('click', function () {
        if (state.idx === 0) { return; }
        state.idx--;
        save();
        renderQuestion();
    });

    el.next.addEventListener('click', function () {
        if (state.idx + 1 >= state.order.length) { finish(); return; }
        state.idx++;
        save();
        renderQuestion();
    });

    /* ================================================================= end
       ============================================================== */

    function finish() {
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

        rows.forEach(function (r, i) {
            /* Equal scores share a rank — two people on 9 are both 2nd, and
               announcing one of them as 3rd at the end of the night is the
               sort of thing that starts an argument. */
            var rank = (r.score === lastScore) ? lastRank : i + 1;
            lastScore = r.score;
            lastRank = rank;

            var li = document.createElement('li');
            if (rank === 1) { li.className = 'is-winner'; }

            var n = document.createElement('span');
            n.className = 'qz-rank';
            n.textContent = rank === 1 ? '\u{1F3C6}' : String(rank);
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
           scores back to nothing. The questions already asked are not
           excluded: the bank is a few hundred deep and a shuffle of the
           whole thing is what a second round should be. */
        startQuiz(state.players.slice(), state.cats.slice(), state.length);
    });

    el.newQuiz.addEventListener('click', function () {
        abandon();
    });

    function abandon() {
        clearStore();
        state = null;
        releaseWakeLock();
        closeSheets();
        el.resume.hidden = true;
        showScreen('setup');
    }

    /* ============================================================== sheets
       ============================================================== */

    function openSheet(node) {
        closeSheets();
        el.backdrop.hidden = false;
        node.hidden = false;
    }

    function closeSheets() {
        el.backdrop.hidden = true;
        el.sheet.hidden = true;
        el.menu.hidden = true;
    }

    el.scoreBtn.addEventListener('click', function () {
        renderBoard();
        openSheet(el.sheet);
    });

    el.menuBtn.addEventListener('click', function () { openSheet(el.menu); });
    el.sheetClose.addEventListener('click', closeSheets);
    el.menuClose.addEventListener('click', closeSheets);
    el.backdrop.addEventListener('click', closeSheets);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeSheets(); }
    });

    function renderBoard() {
        var rows = standings();
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
            plus.setAttribute('aria-label', 'Give a point to ' + r.name);
            plus.textContent = '+';
            plus.addEventListener('click', function () { adjust(r.id, 1); });
            li.appendChild(plus);

            el.board.appendChild(li);
        });
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

    el.optHide.addEventListener('change', function () {
        state.hideAnswers = el.optHide.checked;
        save();
        renderQuestion();
    });

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
        renderPlayers();
        renderCats();

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

/* Pura Panic's rules: the board, the pieces, how they fall and what clears.

   SHARED WITH THE SERVER. netlify/functions/pura-scores.js requires this
   same file and REPLAYS every submitted game through it (see `replay`), so
   the score on the board is one the server worked out itself from the
   placements, never a number the page sent. Nothing in here may touch the
   DOM, a clock or Math.random — the page and the server have to agree on
   every outcome, and both only agree on what is written down here.

   ----------------------------------------------------------------------
   THE FLOOR

   An ordinary Habbo floor: tile (x, y), drawn at screen column c = x - y and
   screen row r = x + y, in half-tiles. The well is the band of that floor
   between two screen columns, so its side walls zig-zag:

       r even:  c = 0, 2, ... 18   ten tiles
       r odd:   c = 1, 3, ... 17   nine tiles

   c and r always share a parity (c + r = 2x), so "is this tile in the well"
   is just 0 <= c <= 18 and r < ROWS. Rows above the top (r < 0) are the
   open air the pieces arrive through.

   A ROW, for clearing, is ONE SCREEN ROW: the tiles in a line across the
   well, touching tip to tip — ten on the even rows, nine on the odd ones
   (the owner's, 6 Oct 2026). It was a zig-zag of two neighbouring screen
   rows first, nineteen tiles, and filling one was next to impossible.

   WHAT COMES FORWARD. A cleared row cannot simply have the rows behind it
   drop into its place — the row behind sits half a tile to the side — so
   instead every tile left HANGING, with nothing under either of its lower
   edges, drops until it rests on something, and any row that fills as
   they land clears too. Pieces come apart doing it, and that is allowed
   here and only here: a piece always LANDS whole (the owner's, 6 Oct
   2026). See `drop`.

   It replaced a rule where a cleared row stayed empty until its neighbour
   cleared and then everything behind moved forward a whole tile. Nothing
   ever split, but a cleared row was usually a dead gap, and a bot cleared
   1.6 rows per ten pieces; with hanging tiles dropping it clears 3.0,
   ordinary Tetris's rate exactly. Letting tiles slide into any free gap,
   not only drop when hanging, was tried too: the bot never lost.

   ----------------------------------------------------------------------
   FALLING, AND WHY IT IS HALF A ROW AT A TIME

   Straight down the screen is (x+1, y+1): two screen rows. A piece that
   only ever moved that way could never change which screen rows it sits
   on, and half of all pieces would come to rest a half-row short of a flat
   floor with a row of empty pockets underneath them. So a piece falls half
   a row per step instead, alternating down-right (x+1) and down-left (y+1),
   each step into "the row behind" — it zig-zags down the floor the way a
   Habbo walks down it, in a lane two half-columns wide. When its next step
   is blocked it has landed. On a flat stack that is always flush, so
   nothing leaves a pocket it did not have to.

   IT DOES NOT SLIDE. The first version took the other step when its own
   was blocked, and on a sloping stack a piece slid down the slope for half
   the well — the landing guide showed it ending up several tiles from where
   it was aimed (the owner's, 6 Oct 2026). The one exception is the side
   wall: a step that is blocked by the wall alone, with nothing in the way
   but the edge of the well, bounces the other way, or a piece against the
   wall would stop in mid-air.

   Left and right are a whole tile along the band, (x-1, y+1) and
   (x+1, y-1), and only ask whether the tile they arrive on is free.

   ----------------------------------------------------------------------
   THE PIECES

   The seven tetrominoes, rotated on the floor itself (a quarter turn in
   (x, y), the way a piece of furni turns), each in a red, blue, green or
   yellow Pura colour (the owner's: those four and no others), so three
   colours are shared by two shapes. */
(function (root) {
    "use strict";

    const COLS = 19;          // screen columns 0..18
    /* Screen rows 0..38: as tall as the window's screen will take under the
       score along its top, with the hash line just above the top row and
       the pieces coming up from under it (the owner's, 6 Oct 2026 — the
       floor stopped well short at 24 rows, ran straight into the top at 38,
       left too much empty air at 34, grew back to 38 when the next-piece
       preview shrank, and took one more when the hash line moved up tight
       under the score). */
    const ROWS = 39;
    const BANDS = ROWS / 2;

    /* Each shape in its own box, rotation 0, as (x, y) floor tiles. A
       quarter turn is (x, y) -> (n-1-y, x) inside that box, which keeps a
       piece turning about its own middle rather than about a corner. */
    const SHAPES = {
        I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], colour: "blue" },
        O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], colour: "yellow" },
        T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], colour: "red" },
        S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], colour: "green" },
        Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], colour: "red" },
        J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], colour: "blue" },
        L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], colour: "yellow" },
        /* THE FILLERS (the owner's, 6 Oct 2026): one seat on its own, and two
           side by side. They plug the one-tile holes that stop most lines
           being finished — a bot cleared 45% more rows with them dealt in.
           Not in the seven-bag: dealt beside it, as many as the level allows
           (see FILLERS). */
        M: { n: 1, cells: [[0, 0]], colour: "green" },
        D: { n: 2, cells: [[0, 0], [1, 0]], colour: "blue" }
    };
    const TETROMINOES = ["I", "O", "T", "S", "Z", "J", "L"];
    const KINDS = TETROMINOES.concat(["M", "D"]);

    function turn(cells, n) { return cells.map(([x, y]) => [n - 1 - y, x]); }

    // ROTATIONS[kind][rot] = cells. O and the single seat do not turn.
    const ROTATIONS = {};
    for (const k of KINDS) {
        const s = SHAPES[k];
        const all = [s.cells];
        for (let i = 1; i < 4; i++) all.push(k === "O" || k === "M" ? s.cells : turn(all[i - 1], s.n));
        ROTATIONS[k] = all;
    }

    /* Where a piece turns to when the turn itself is blocked: the same spot,
       a tile either way along the band, up a band, two tiles either way. In
       (x, y): a tile left is (-1, +1), right (+1, -1), up a band (-1, -1). */
    const KICKS = [[0, 0], [-1, 1], [1, -1], [-1, -1], [-2, 2], [2, -2]];

    const MOVES = {
        left: [-1, 1],
        right: [1, -1],
        downRight: [1, 0],
        downLeft: [0, 1]
    };

    /* Points for the rows one landing clears, times the level. Nothing else
       scores — no points for dropping fast — so the server can work out the
       whole score from where the pieces ended up.

       Small numbers on purpose (the owner's, 6 Oct 2026: 3,400 points by
       level 4 was "insane"). It was Tetris's 100/300/500/800; now a row is
       a point, and clearing several at once is still worth more than one at
       a time: about 35 points by level 4. */
    const CLEAR_POINTS = [0, 1, 3, 5, 8];

    /* ---------------------------------------------------------------- THE CURVE

       A hundred levels, a level every five rows, and from 100 on the game
       stays exactly as hard as level 100 (the owner's, 6 Oct 2026): the
       level number keeps counting, and keeps multiplying the score, but
       nothing gets any harder. Two things climb together, the same small
       step every level:

         how fast a piece falls       a half-row in 340ms at level 1 (about
                                      13 seconds down the whole well), 42ms
                                      at 100 (about 1.6 seconds)
         how long a landed piece      900ms at level 1 to slide it into a gap,
           waits before it sets       375ms at 100 — the page's alone, since
                                      the server only sees where pieces ended
         (the fillers do not thin out — see FILLERS)

       Each level is the same small step harder than the one before (a
       geometric curve: every level multiplies the speed by the same amount),
       so it feels steady from the first level to the hundredth rather than
       flat for fifty and then a cliff.

       THE TOP IS WHAT LEVEL 80 USED TO BE (the owner's, 6 Oct 2026: level
       100 was "slightly too hard"). It ran to 25ms and 300ms; those two
       numbers are level 80's from that curve, and the whole curve was
       re-spread to reach them at 100. */
    const ROWS_PER_LEVEL = 5;
    const MAX_LEVEL = 100;
    const BANDS_PER_LEVEL = ROWS_PER_LEVEL;

    function levelFor(rows) { return 1 + Math.floor(rows / ROWS_PER_LEVEL); }

    // How far up the curve a level is: 0 at level 1, 1 at 100 and beyond.
    const along = (level) => (Math.min(Math.max(level, 1), MAX_LEVEL) - 1) / (MAX_LEVEL - 1);
    const between = (a, b, level) => Math.round(a * Math.pow(b / a, along(level)));

    function stepMs(level) { return between(340, 42, level); }
    function lockMs(level) { return between(900, 375, level); }

    /* FILLERS: the single seats and two-seaters dealt with each seven-bag —
       two of each, 4 in every 11 pieces, at EVERY level (the owner's, 6 Oct
       2026: "the game is pretty much impossible without them"). They used to
       thin out from level 11 as part of the difficulty curve; now the curve
       is the speed and the landing pause alone. The level is still passed,
       so the curve can take them up again without touching the bag. */
    function fillersFor(level) {
        return ["M", "M", "D", "D"];
    }

    /* ---------------------------------------------------------------- RANDOM

       mulberry32 from a 32-bit seed — small, and the same on every engine
       that does 32-bit integer maths, which is all of them. The seed comes
       from the server's run token, so the page cannot pick a friendly one. */
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* The seven-bag: every shape once, shuffled, then the next seven — with
       the level's fillers shuffled in among them. The level is the one the
       game is at when the bag is opened, which the server knows as well as
       the page does. */
    function bag(seed) {
        const rand = rng(seed);
        let queue = [];
        return function next(level) {
            if (!queue.length) {
                queue = TETROMINOES.concat(fillersFor(level || 1));
                for (let i = queue.length - 1; i > 0; i--) {
                    const j = Math.floor(rand() * (i + 1));
                    const t = queue[i]; queue[i] = queue[j]; queue[j] = t;
                }
            }
            return queue.shift();
        };
    }

    /* ---------------------------------------------------------------- THE BOARD

       board[r][c] is null or what is standing there ({ kind, colour } and
       whatever the page hangs on it). Cells whose parity does not match
       their row are never used. */
    function emptyBoard() {
        const b = [];
        for (let r = 0; r < ROWS; r++) b.push(new Array(COLS).fill(null));
        return b;
    }

    const toScreen = (x, y) => ({ c: x - y, r: x + y });

    function cellsOf(piece) {
        return ROTATIONS[piece.kind][piece.rot].map(([x, y]) => {
            const fx = x + piece.x, fy = y + piece.y;
            return { x: fx, y: fy, c: fx - fy, r: fx + fy };
        });
    }

    function fits(board, piece) {
        for (const p of cellsOf(piece)) {
            if (p.c < 0 || p.c >= COLS || p.r >= ROWS) return false;
            if (p.r >= 0 && board[p.r][p.c]) return false;
        }
        return true;
    }

    const shifted = (piece, dx, dy, rot) => ({
        kind: piece.kind,
        rot: rot === undefined ? piece.rot : rot,
        x: piece.x + dx,
        y: piece.y + dy,
        lean: piece.lean
    });

    /* Where a new piece appears: its middle on the well's middle column and
       its lowest tile one row above the top, so it falls in from the air. */
    function spawn(kind) {
        const piece = { kind, rot: 0, x: 0, y: 0, lean: 0 };
        const cells = cellsOf(piece);
        const cs = cells.map(p => p.c), rs = cells.map(p => p.r);
        let dc = Math.round((COLS - 1) / 2 - (Math.min(...cs) + Math.max(...cs)) / 2);
        let dr = -1 - Math.max(...rs);
        // A shift in (c, r) is only a shift in (x, y) when both are even or both odd.
        if ((dc + dr) & 1) dr -= 1;
        piece.x = (dc + dr) / 2;
        piece.y = (dr - dc) / 2;
        return piece;
    }

    /* One half-row step down, or null when it has landed. `lean` is which
       way it tries first (0 down-right, 1 down-left); it flips after every
       step so the piece zig-zags rather than drifting. */
    function fall(board, piece) {
        const first = piece.lean ? MOVES.downLeft : MOVES.downRight;
        const other = piece.lean ? MOVES.downRight : MOVES.downLeft;
        let next = shifted(piece, first[0], first[1]);
        if (fits(board, next)) { next.lean = piece.lean ^ 1; return next; }
        if (!onlyTheWall(board, next)) return null;
        next = shifted(piece, other[0], other[1]);
        if (fits(board, next)) { next.lean = piece.lean; return next; }
        return null;
    }

    // Blocked by the side of the well and by nothing else.
    function onlyTheWall(board, piece) {
        let wall = false;
        for (const p of cellsOf(piece)) {
            if (p.r >= ROWS) return false;
            if (p.c < 0 || p.c >= COLS) { wall = true; continue; }
            if (p.r >= 0 && board[p.r][p.c]) return false;
        }
        return wall;
    }

    const landed = (board, piece) => fall(board, piece) === null;

    function move(board, piece, dir) {
        const m = MOVES[dir];
        const next = shifted(piece, m[0], m[1]);
        return fits(board, next) ? next : null;
    }

    /* THE TUCK: a piece that has landed, pushed left or right, first tries
       to slip half a row down that side — into a gap its own zig-zag would
       never have taken it to, because it was stepping the other way — and
       only slides along the row if there is no gap (the owner's, 6 Oct 2026:
       the last-moment move every Tetris has). Measured on bot games, it
       takes the pockets a single seat can reach from 22% to 29% of those
       open above it, which is every one a piece could reach even if it could
       be steered half a tile at a time all the way down; the rest are sealed
       further up, as a buried hole in Tetris is. */
    function tuck(board, piece, dir) {
        const m = dir === "left" ? MOVES.downLeft : MOVES.downRight;
        const next = shifted(piece, m[0], m[1]);
        if (!fits(board, next)) return null;
        // Its next step is back the other way, as if it had fallen there.
        next.lean = dir === "left" ? 0 : 1;
        return next;
    }

    /* Whether a free tile can be reached at all: joined to the open air
       above the well by free tiles, through their edges or a slide along a
       row. The page lights a nearly-full line's gap only when it can be. */
    function open(board, r, c) {
        if (board[r][c]) return false;
        const seen = new Set([r * COLS + c]);
        const q = [[r, c]];
        while (q.length) {
            const [rr, cc] = q.shift();
            if (rr === 0) return true;
            for (const [dr, dc] of [[-1, -1], [-1, 1], [0, -2], [0, 2], [1, -1], [1, 1]]) {
                const nr = rr + dr, nc = cc + dc;
                if (nr < 0) return true;
                if (nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc]) continue;
                const k = nr * COLS + nc;
                if (seen.has(k)) continue;
                seen.add(k);
                q.push([nr, nc]);
            }
        }
        return false;
    }

    function rotate(board, piece, way) {
        const rot = (piece.rot + (way < 0 ? 3 : 1)) % 4;
        for (const [dx, dy] of KICKS) {
            const next = shifted(piece, dx, dy, rot);
            if (fits(board, next)) return next;
        }
        return null;
    }

    // Where it would land if dropped now: the ghost, and the hard drop.
    function dropped(board, piece) {
        let p = piece, n;
        let guard = 0;
        while ((n = fall(board, p)) && guard++ < 200) p = n;
        return p;
    }

    /* Puts the piece down and clears what it completes.

       Returns { board, cleared: [the upper screen row of each zig-zag
       cleared, top first], topOut, before }. A piece
       that comes to rest with any tile still above the well ends the game —
       it is drawn where it stopped, since that is where it ended. `dress`
       is the page's chance to hang what it draws on each tile. */
    function lock(board, piece, dress) {
        const cells = cellsOf(piece);
        const next = board.map(row => row.slice());
        const info = { kind: piece.kind, colour: SHAPES[piece.kind].colour };
        const topOut = cells.some(p => p.r < 0);
        cells.forEach((p, i) => {
            if (p.r < 0) return;
            next[p.r][p.c] = dress ? Object.assign({}, info, dress(i, p)) : info;
        });
        const first = [];
        if (!topOut) for (let r = 0; r < ROWS; r++) if (rowFull(next, r)) first.push(r);
        if (!first.length) return { board: next, cleared: first, first, topOut, before: next, stages: [] };
        const mid = next.map((row, r) => first.includes(r) ? new Array(COLS).fill(null) : row);
        const d = drop(mid);
        return { board: d.board, cleared: first.concat(d.cleared), first, topOut, before: next, stages: d.stages };
    }

    /* A PIECE LANDS WHOLE. For a while a landed piece's modules dropped on
       their own into the half-tile pockets along the walls, because on the
       first, twelve-band well — where pieces also slid down slopes — those
       pockets were most of what kept rows from clearing (a bot cleared four
       rows a game without it, fourteen with it). It split pieces apart as
       they landed, which looked broken (the owner's, 6 Oct 2026), and with
       the well grown to nineteen bands and the sliding gone, the same bot
       lasts 143 pieces with nothing dropping, against 152 in ordinary
       Tetris. So nothing drops. */

    function rowFull(board, r) {
        for (let c = r & 1; c < COLS; c += 2) if (!board[r][c]) return false;
        return true;
    }

    /* Every hanging tile drops — nothing under its lower-left or its
       lower-right edge — a whole tile straight down while it can, else half
       a row down-left (or down-right, against the left wall) into the gap,
       until nothing hangs; then any rows that filled clear, and again. A
       wall does not hold a tile up (see below). Lowest tiles first, left to
       right, so the page and the server agree.

       Measured on a bot (which never feels the speed, so never loses here):
       3.5 rows per ten pieces with tiles dropping off the walls, against 2.8
       when the walls held them and ordinary Tetris's 3.0.

       Returns the board, the rows cleared along the way, and for the page's
       animation where every tile that moved came from and went to, and
       where the ones cleared on the way were (both as positions in the board
       it was given). */
    function drop(board) {
        board = board.map(row => row.slice());
        // Who is where, so a tile can be followed however far it goes.
        let ids = board.map(row => row.map(() => 0));
        let n = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (board[r][c]) ids[r][c] = ++n;
        }
        const cleared = [], stages = [];
        const free = (r, c) => r < ROWS && c >= 0 && c < COLS && !board[r][c];
        for (let round = 0; round < ROWS; round++) {
            // Where everything stood as this round began.
            const from = board.map(row => row.slice());
            const startAt = new Map();
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (ids[r][c]) startAt.set(ids[r][c], { r, c });
            let moved = true, guard = 0;
            while (moved && guard++ < ROWS * 4) {
                moved = false;
                for (let r = ROWS - 2; r >= 0; r--) {
                    for (let c = r & 1; c < COLS; c += 2) {
                        const v = board[r][c];
                        if (!v) continue;
                        const leftOpen = c - 1 >= 0 && !board[r + 1][c - 1];
                        const rightOpen = c + 1 < COLS && !board[r + 1][c + 1];
                        /* Against a wall the wall is NOT support: a tile there
                           hangs when its one inner edge is open (the owner's,
                           6 Oct 2026). Counting the wall as support left whole
                           columns of seats stuck to both sides of the well
                           after the rows under them had gone, which read as
                           the game not working. */
                        const atWall = c - 1 < 0 || c + 1 >= COLS;
                        if (atWall ? !(leftOpen || rightOpen) : !(leftOpen && rightOpen)) continue;
                        let tr, tc;
                        if (free(r + 2, c)) { tr = r + 2; tc = c; }
                        else if (leftOpen) { tr = r + 1; tc = c - 1; }
                        else { tr = r + 1; tc = c + 1; }
                        board[tr][tc] = v; board[r][c] = null;
                        ids[tr][tc] = ids[r][c]; ids[r][c] = 0;
                        moved = true;
                    }
                }
            }
            const moves = [];
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
                const s = ids[r][c] && startAt.get(ids[r][c]);
                if (s && (s.r !== r || s.c !== c)) moves.push({ fromR: s.r, fromC: s.c, r, c });
            }
            const full = [];
            for (let r = 0; r < ROWS; r++) if (rowFull(board, r)) full.push(r);
            /* A STAGE of the chain, for the page to play out: the tiles that
               fell this round, and the rows their landing filled — which
               clear as their own flash, not silently with the first one
               (the owner's, 6 Oct 2026: rows filled by falling tiles
               vanished in the same instant, and looked like seats falling
               out of the well). */
            if (moves.length || full.length) stages.push({ from, moves, settled: board.map(row => row.slice()), cleared: full });
            if (!full.length) break;
            full.forEach(r => {
                cleared.push(r);
                for (let c = 0; c < COLS; c++) { board[r][c] = null; ids[r][c] = 0; }
            });
        }
        return { board, cleared, stages };
    }

    /* ---------------------------------------------------------------- A GAME

       The state machine both sides drive. The page calls these as the
       player plays; `replay` calls `place` straight from a log. */
    function newGame(seed) {
        const next = bag(seed);
        const g = {
            seed: seed >>> 0,
            board: emptyBoard(),
            queue: [next(1), next(1), next(1)],
            draw: null,
            piece: null,
            score: 0,
            bands: 0,
            level: 1,
            pieces: 0,
            over: false,
            log: []
        };
        g.draw = () => next(g.level);
        g.piece = spawn(g.queue.shift());
        g.queue.push(g.draw());
        return g;
    }


    /* The current piece has come to rest where it is: score it and deal the
       next. Returns what happened, for the page to animate. */
    function settle(g, dress) {
        const piece = g.piece;
        // Its lane as well as its place: which way its next step would have
        // gone decides whether it had landed (see fall).
        g.log.push([piece.rot, piece.x, piece.y, piece.lean ? 1 : 0]);
        const res = lock(g.board, piece, dress);
        g.board = res.board;
        g.pieces++;
        const n = res.cleared.length;
        if (n) {
            g.score += CLEAR_POINTS[Math.min(n, 4)] * g.level;
            g.bands += n;
            g.level = levelFor(g.bands);
        }
        if (res.topOut) {
            g.over = true;
            g.piece = null;
        } else {
            g.piece = spawn(g.queue.shift());
            g.queue.push(g.draw());
            // The well is so full the new piece has nowhere to be.
            if (!fits(g.board, g.piece)) { g.over = true; }
        }
        return res;
    }

    /* ---------------------------------------------------------------- THE REPLAY

       What the server does with a finished game: deal the same pieces from
       the same seed, put each one where the log says it ended up, and score
       the result. Every placement has to be somewhere the piece could be —
       inside the well, on nothing else — and RESTING, not hanging in the air
       where it could still have fallen.

       It does not prove the piece could have been steered there; a ledge
       reached by a tuck is a legal place for a piece to be, and so is one no
       real hand could reach. That is the honest limit, and it rules out the
       realistic cheat — a score typed into a request — entirely. */
    function replay(seed, log, limit) {
        if (!Array.isArray(log)) return { ok: false, error: "No placements" };
        if (log.length > (limit || 20000)) return { ok: false, error: "Too many placements" };
        const g = newGame(seed);
        /* How the game went, for the Warren's Pura Panic page: the pieces
           that cleared one, two, three and four-or-more rows at once, and
           the chains (rows filled by tiles dropping after a clear). */
        const clears = [0, 0, 0, 0];
        let chains = 0;
        for (let i = 0; i < log.length; i++) {
            if (g.over) return { ok: false, error: "A piece after the game ended" };
            const e = log[i];
            if (!Array.isArray(e) || e.length !== 4 || !e.every(Number.isInteger)) {
                return { ok: false, error: "A placement is not four whole numbers" };
            }
            const [rot, x, y, lean] = e;
            if (lean !== 0 && lean !== 1) return { ok: false, error: "A piece in no lane" };
            if (rot < 0 || rot > 3) return { ok: false, error: "A piece turned past four" };
            const p = { kind: g.piece.kind, rot, x, y, lean };
            if (!fits(g.board, p)) return { ok: false, error: `Piece ${i + 1} is somewhere it cannot be` };
            if (!landed(g.board, p)) return { ok: false, error: `Piece ${i + 1} was left in the air` };
            g.piece = p;
            const res = settle(g);
            const n = res.cleared.length;
            if (n) clears[Math.min(n, 4) - 1]++;
            chains += (res.stages || []).filter(s => s.cleared.length).length;
        }
        return { ok: true, score: g.score, bands: g.bands, level: g.level, pieces: g.pieces, over: g.over, clears, chains };
    }

    const api = {
        COLS, ROWS, BANDS, SHAPES, KINDS, ROTATIONS, CLEAR_POINTS, BANDS_PER_LEVEL, MAX_LEVEL,
        toScreen, cellsOf, fits, fall, landed, move, tuck, open, rotate, dropped, lock, spawn,
        newGame, settle, replay, stepMs, lockMs, levelFor, fillersFor, bag, rng, drop
    };

    if (typeof module === "object" && module.exports) module.exports = api;
    else root.PuraEngine = api;
})(typeof window !== "undefined" ? window : this);

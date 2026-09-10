// ╔══════════════════════════════════════════════════════════════════╗
// ║  GitHub Contribution Graph Pac-Man  ·  game.js                  ║
// ║  Arrow / WASD to move  ·  P = pause  ·  R = restart             ║
// ╚══════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────
     CANVAS SETUP
  ────────────────────────────────────────────────────────────────── */
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* ──────────────────────────────────────────────────────────────────
     LAYOUT  (mirrors GitHub contribution graph proportions)
  ────────────────────────────────────────────────────────────────── */
  const CELL  = 12;          // contribution cell size px
  const GAP   = 3;           // gap between cells px
  const S     = CELL + GAP;  // step = 15 px per cell
  const COLS  = 52;          // 52 weeks
  const ROWS  = 7;           // 7 days
  const HTOP  = 26;          // header height for month labels

  const CW = COLS * S + GAP;
  const CH = ROWS * S + GAP + HTOP;

  canvas.width  = CW;
  canvas.height = CH;

  /* ──────────────────────────────────────────────────────────────────
     TILE TYPES
  ────────────────────────────────────────────────────────────────── */
  const T = { WALL: 0, DOT: 1, EMPTY: 2, POWER: 3 };

  /* ──────────────────────────────────────────────────────────────────
     COLOURS  (GitHub dark-mode palette)
  ────────────────────────────────────────────────────────────────── */
  const C = {
    bg       : '#0d1117',
    cellEmpty: '#161b22',
    border   : '#21262d',
    dot      : ['#0e4429', '#006d32', '#26a641', '#39d353'],
    power    : '#39d353',
    wallLine : '#e6edf3',
    txt      : '#8b949e',
    pac      : '#f8c535',
    ghost    : ['#58a6ff', '#79c0ff', '#388bfd', '#1f6feb'],
    fright   : '#6e7681',
    frightF  : '#ffffff',
  };

  /* ──────────────────────────────────────────────────────────────────
     MONTH LABELS
  ────────────────────────────────────────────────────────────────── */
  const MONTHS = ['Dec','Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov'];
  const MCOL   = [0, 4, 9, 13, 18, 22, 27, 31, 36, 40, 44, 48];

  /* ──────────────────────────────────────────────────────────────────
     DIRECTIONS
  ────────────────────────────────────────────────────────────────── */
  const D = {
    R: { dx:  1, dy:  0, a: 0           },
    L: { dx: -1, dy:  0, a: Math.PI     },
    D: { dx:  0, dy:  1, a: Math.PI/2   },
    U: { dx:  0, dy: -1, a:-Math.PI/2   },
    N: { dx:  0, dy:  0, a: 0           },
  };
  const OPP = { R:'L', L:'R', D:'U', U:'D', N:'N' };
  const DKEYS = Object.keys(D);
  function dirKey(d) { return DKEYS.find(k => D[k] === d) || 'N'; }

  /* ──────────────────────────────────────────────────────────────────
     MAZE DEFINITION
     ─────────────────────────────────────────────────────────────────
     Wall pairs + their single passable gap-row:
       cols  8–9   gap at row 0  (Dec → Jan boundary)
       cols 17–18  gap at row 6  (Jan → Feb boundary)
       cols 26–27  gap at row 0  (Feb → Apr boundary)
       cols 35–36  gap at row 6  (Apr → Jun boundary)
       cols 44–45  gap at row 0  (Jun → Sep boundary)

     Within every non-wall section all 7 rows are open (dots).
     Power pellets sit in the 4 corners.
  ────────────────────────────────────────────────────────────────── */
  const WALL_DEFS = [
    { cols: [8,  9],  gapRow: 0 },
    { cols: [17, 18], gapRow: 6 },
    { cols: [26, 27], gapRow: 0 },
    { cols: [35, 36], gapRow: 6 },
    { cols: [44, 45], gapRow: 0 },
  ];

  // Fast lookup: wallCol → gapRow
  const wallMap = new Map();
  for (const w of WALL_DEFS) w.cols.forEach(c => wallMap.set(c, w.gapRow));

  let maze = [];

  function buildMaze() {
    const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(T.DOT));
    for (const [col, gapRow] of wallMap) {
      for (let r = 0; r < ROWS; r++) {
        if (r !== gapRow) g[r][col] = T.WALL;
      }
    }
    // Power pellets — 4 corners
    g[0][0]         = T.POWER;
    g[0][COLS - 1]  = T.POWER;
    g[ROWS-1][0]    = T.POWER;
    g[ROWS-1][COLS-1] = T.POWER;
    return g;
  }

  function resetMaze() { maze = buildMaze(); }

  function isWall(c, r) {
    return c < 0 || c >= COLS || r < 0 || r >= ROWS || maze[r][c] === T.WALL;
  }

  function countPellets() {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (maze[r][c] === T.DOT || maze[r][c] === T.POWER) n++;
    return n;
  }

  /* ──────────────────────────────────────────────────────────────────
     PIXEL HELPERS
  ────────────────────────────────────────────────────────────────── */
  const cpx = c => c * S + GAP + CELL / 2;
  const cpy = r => HTOP + r * S + GAP + CELL / 2;

  /* ──────────────────────────────────────────────────────────────────
     GAME STATE
  ────────────────────────────────────────────────────────────────── */
  let state       = 'start';   // start | playing | paused | gameover | won
  let score       = 0;
  let hiScore     = +(localStorage.getItem('ghpac_hi') || 0);
  let lives       = 3;
  let pelletsLeft = 0;
  let frightLeft  = 0;
  const FRIGHT_DUR = 280;      // frames (~4.7 s at 60 fps)

  /* ──────────────────────────────────────────────────────────────────
     PAC-MAN
  ────────────────────────────────────────────────────────────────── */
  const pac = {
    col: 0, row: 3,
    px: 0,  py: 0,
    dir: D.R, nextDir: D.R,
    speed: 1.5,
    mouth: 0, mouthGrow: true,
    dead: false, deadT: 0,

    snap() {
      this.col = 0; this.row = 3;
      this.px  = cpx(0); this.py = cpy(3);
      this.dir = D.R; this.nextDir = D.R;
      this.dead = false; this.deadT = 0;
      this.mouth = 0; this.mouthGrow = true;
    },

    setDir(d) { this.nextDir = d; },

    update() {
      if (this.dead) { this.deadT++; return; }

      // Mouth animation
      this.mouth += this.mouthGrow ? 0.09 : -0.09;
      if (this.mouth >= Math.PI / 4) { this.mouth = Math.PI / 4; this.mouthGrow = false; }
      if (this.mouth <= 0)           { this.mouth = 0;            this.mouthGrow = true;  }

      // Move toward target cell centre
      const tx = cpx(this.col), ty = cpy(this.row);
      const ddx = tx - this.px, ddy = ty - this.py;
      const dist = Math.hypot(ddx, ddy);

      if (dist <= this.speed) {
        this.px = tx; this.py = ty;

        // Try queued direction first, fall back to current
        const nd = this.nextDir;
        const nc = this.col + nd.dx, nr = this.row + nd.dy;
        if (!isWall(nc, nr)) {
          this.dir = nd; this.col = nc; this.row = nr;
        } else {
          const cc = this.col + this.dir.dx, cr = this.row + this.dir.dy;
          if (!isWall(cc, cr)) { this.col = cc; this.row = cr; }
        }
        this._eat();
      } else {
        this.px += (ddx / dist) * this.speed;
        this.py += (ddy / dist) * this.speed;
      }
    },

    _eat() {
      const t = maze[this.row]?.[this.col];
      if (t === T.DOT) {
        maze[this.row][this.col] = T.EMPTY;
        score += 10; pelletsLeft--;
        syncUI();
        if (pelletsLeft <= 0) winGame();
      } else if (t === T.POWER) {
        maze[this.row][this.col] = T.EMPTY;
        score += 50; pelletsLeft--;
        frightLeft = FRIGHT_DUR;
        syncUI();
        if (pelletsLeft <= 0) winGame();
      }
    },

    draw() {
      const r = CELL / 2 - 1;
      ctx.save();
      ctx.translate(this.px, this.py);

      if (this.dead) {
        const p = Math.min(this.deadT / 55, 1);
        ctx.rotate(-Math.PI * p * 0.6);
        ctx.scale(1 - p * 0.6, 1 - p * 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, r, this.mouth, Math.PI * 2 - this.mouth);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fillStyle = C.pac;
        ctx.fill();
      } else {
        ctx.rotate(this.dir.a);
        // Body
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, this.mouth, Math.PI * 2 - this.mouth);
        ctx.closePath();
        ctx.fillStyle = C.pac;
        ctx.fill();
        // Eye
        ctx.beginPath();
        ctx.arc(r * 0.2, -r * 0.52, r * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = '#0d1117';
        ctx.fill();
      }
      ctx.restore();
    },
  };

  /* ──────────────────────────────────────────────────────────────────
     GHOST CLASS
  ────────────────────────────────────────────────────────────────── */
  class Ghost {
    constructor(sc, sr, idx) {
      this.sc  = sc; this.sr  = sr;
      this.idx = idx;
      this.clr = C.ghost[idx];
      this._place(sc, sr);
      this.releaseT = idx * 75;  // stagger release by 1.25 s each
    }

    _place(c, r) {
      this.col = c; this.row = r;
      this.px  = cpx(c); this.py  = cpy(r);
      this.dir = D.L;
    }

    get speed() { return this.eaten ? 2.5 : this.fright ? 0.85 : 1.2; }

    /* Available moves (excludes reversing unless forced) */
    avail() {
      const oppK = OPP[dirKey(this.dir)];
      const moves = ['R','L','U','D']
        .filter(k => k !== oppK)
        .map(k => D[k])
        .filter(d => !isWall(this.col + d.dx, this.row + d.dy));
      if (moves.length) return moves;
      // Forced reversal
      const rev = D[OPP[dirKey(this.dir)]];
      return isWall(this.col + rev.dx, this.row + rev.dy) ? [] : [rev];
    }

    /* Pick next direction */
    pick() {
      const av = this.avail();
      if (!av.length) return D.N;
      if (this.fright) return av[Math.random() * av.length | 0];

      // Target based on ghost personality
      let tc = pac.col, tr = pac.row;
      if (this.idx === 1) {               // Pinky — 4 ahead
        tc = Math.max(0, Math.min(COLS-1, pac.col + pac.dir.dx * 4));
        tr = Math.max(0, Math.min(ROWS-1, pac.row + pac.dir.dy * 4));
      } else if (this.idx === 2) {        // Inky — lag behind
        tc = Math.max(0, Math.min(COLS-1, pac.col - pac.dir.dx * 2));
        tr = Math.max(0, Math.min(ROWS-1, pac.row - pac.dir.dy * 2));
      } else if (this.idx === 3) {        // Clyde — scatter if close
        if (Math.abs(this.col - pac.col) + Math.abs(this.row - pac.row) < 9) {
          tc = 0; tr = ROWS - 1;
        }
      }

      // Minimise Manhattan distance to target
      let best = av[0], bestD = Infinity;
      for (const d of av) {
        const nd = Math.abs(this.col + d.dx - tc) + Math.abs(this.row + d.dy - tr);
        if (nd < bestD) { bestD = nd; best = d; }
      }
      return best;
    }

    resetEaten() {
      this._place(this.sc, this.sr);
      this.fright = false; this.eaten = false;
      this.releaseT = 80;
    }

    resetFull() {
      this._place(this.sc, this.sr);
      this.fright = false; this.eaten = false;
      this.releaseT = this.idx * 75;
    }

    update() {
      if (this.releaseT > 0) { this.releaseT--; return; }

      this.fright = frightLeft > 0 && !this.eaten;

      const tx = cpx(this.col), ty = cpy(this.row);
      const ddx = tx - this.px, ddy = ty - this.py;
      const d   = Math.hypot(ddx, ddy);

      if (d <= this.speed) {
        this.px = tx; this.py = ty;
        const nd = this.pick();
        const nc = this.col + nd.dx, nr = this.row + nd.dy;
        if (!isWall(nc, nr)) { this.col = nc; this.row = nr; }
      } else {
        this.px += (ddx / d) * this.speed;
        this.py += (ddy / d) * this.speed;
      }

      // Collision with Pac-Man
      if (!pac.dead && !this.eaten) {
        if (Math.abs(this.px - pac.px) < CELL * 0.85 &&
            Math.abs(this.py - pac.py) < CELL * 0.85) {
          if (this.fright) {
            this.eaten = true;
            score += 200; syncUI();
            setTimeout(() => this.resetEaten(), 3000);
          } else {
            killPac();
          }
        }
      }
    }

    draw() {
      const x = this.px, y = this.py, r = CELL / 2 - 1;

      if (this.eaten) {
        drawEyes(x, y, r, '#ffffff', '#1f6feb');
        return;
      }

      // Body colour
      let color = this.clr;
      if (this.fright) {
        color = (frightLeft < 80 && (frightLeft / 10 | 0) % 2 === 0)
          ? C.frightF : C.fright;
      }

      ctx.save();
      ctx.translate(x, y);

      // Ghost body
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, 0, false);   // head (semicircle)
      ctx.lineTo(r, r * 0.85);                // right side down
      const fw = (r * 2) / 3;
      ctx.quadraticCurveTo(r - fw * 0.5, r * 0.35, r - fw,     r * 0.85);
      ctx.quadraticCurveTo(r - fw * 1.5, r * 0.35, 0,          r * 0.85);
      ctx.quadraticCurveTo(0 - fw * 0.5, r * 0.35, -r + fw,    r * 0.85);
      ctx.quadraticCurveTo(-r + fw*0.5,  r * 0.35, -r,         r * 0.85);
      ctx.lineTo(-r, 0);                       // left side back up
      ctx.fillStyle = color;
      ctx.fill();

      if (!this.fright) {
        drawEyes(0, 0, r, '#ffffff', '#1f6feb');
      } else {
        // Scared dots
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.05, r * 0.11, 0, Math.PI * 2);
        ctx.arc( r * 0.28, -r * 0.05, r * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        // Squiggle mouth
        ctx.beginPath();
        ctx.moveTo(-r * 0.38, r * 0.28);
        for (let i = 0; i <= 4; i++) {
          ctx.lineTo(-r * 0.38 + i * r * 0.19,
                      r * 0.28 + (i % 2 ? r * 0.13 : 0));
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
      }

      ctx.restore();
    }
  }

  /* Draw ghost eyes — works in both world-coords and translated-coords */
  function drawEyes(x, y, r, eyeClr, pupilClr) {
    [[-0.3, 0], [0.3, 0]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.ellipse(x + ex * r, y + ey * r - r * 0.08,
                  r * 0.24, r * 0.29, 0, 0, Math.PI * 2);
      ctx.fillStyle = eyeClr; ctx.fill();

      ctx.beginPath();
      ctx.arc(x + ex * r + r * 0.07, y + ey * r - r * 0.08,
              r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = pupilClr; ctx.fill();
    });
  }

  /* ──────────────────────────────────────────────────────────────────
     GHOST INSTANCES
     Spread across 4 sections so every section feels dangerous!
  ────────────────────────────────────────────────────────────────── */
  let ghosts = [];

  function mkGhosts() {
    ghosts = [
      new Ghost(13, 3, 0),   // Section 2 — Blinky (direct chase)
      new Ghost(22, 3, 1),   // Section 3 — Pinky  (ahead of Pac)
      new Ghost(31, 3, 2),   // Section 4 — Inky   (lag)
      new Ghost(40, 3, 3),   // Section 5 — Clyde  (scatter)
    ];
  }

  /* ──────────────────────────────────────────────────────────────────
     GAME EVENTS
  ────────────────────────────────────────────────────────────────── */
  function killPac() {
    if (pac.dead) return;
    pac.dead = true; lives--; syncUI();
    setTimeout(() => {
      if (lives <= 0) {
        state = 'gameover';
        showOverlay('💀 GAME OVER', `Final Score: ${score}`, 'TRY AGAIN');
      } else {
        pac.snap(); mkGhosts();
      }
    }, 1800);
  }

  function winGame() {
    state = 'won';
    if (score > hiScore) { hiScore = score; localStorage.setItem('ghpac_hi', hiScore); }
    showOverlay('🎉 ALL CONTRIBUTIONS EATEN!',
                `Score: ${score}  ·  Best: ${hiScore}`,
                'PLAY AGAIN');
  }

  function showOverlay(title, sub, btnText) {
    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('ov-title').textContent  = title;
    document.getElementById('ov-sub').textContent    = sub;
    document.getElementById('ov-btn').textContent    = `▶ ${btnText}`;
  }
  function hideOverlay() { document.getElementById('overlay').style.display = 'none'; }

  function syncUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('hi').textContent    = hiScore;
    document.getElementById('lives').textContent = '❤️'.repeat(Math.max(0, lives));
  }

  /* ──────────────────────────────────────────────────────────────────
     DRAW — Background + grid
  ────────────────────────────────────────────────────────────────── */
  function dotColor(c, r) {
    // Pseudo-random contribution level per cell (stable)
    return C.dot[((c * 17 + r * 31) % 53) % 4];
  }

  function drawMonthLabels() {
    ctx.font      = '10px "Segoe UI",Helvetica,sans-serif';
    ctx.fillStyle = C.txt;
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';
    for (let i = 0; i < MONTHS.length; i++) {
      ctx.fillText(MONTHS[i], MCOL[i] * S + GAP, 4);
    }
  }

  function drawGrid() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = maze[r][c];
        if (t === T.WALL) continue;   // wall cells = invisible (bg colour)

        const x = c * S + GAP;
        const y = HTOP + r * S + GAP;

        // Rounded cell rect
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, CELL, CELL, 2);
        else               ctx.rect(x, y, CELL, CELL);

        switch (t) {
          case T.DOT  : ctx.fillStyle = dotColor(c, r); break;
          case T.POWER: ctx.fillStyle = C.power;         break;
          case T.EMPTY: ctx.fillStyle = C.cellEmpty;     break;
        }
        ctx.fill();

        // Subtle border for non-empty cells
        if (t !== T.EMPTY) {
          ctx.strokeStyle = C.border;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  /* Draw white outline lines around wall column pairs */
  function drawWallLines() {
    ctx.save();
    ctx.strokeStyle = C.wallLine;
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';

    for (const { cols, gapRow } of WALL_DEFS) {
      const leftCol  = cols[0];
      const rightCol = cols[cols.length - 1];

      for (const col of cols) {
        const isFirst = col === leftCol;
        const isLast  = col === rightCol;

        for (let r = 0; r < ROWS; r++) {
          if (r === gapRow) continue;

          const x = col * S + GAP;
          const y = HTOP + r * S + GAP;

          const wallAbove = r > 0      && r - 1 !== gapRow;
          const wallBelow = r < ROWS-1 && r + 1 !== gapRow;

          // Top edge
          if (!wallAbove) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + CELL, y); ctx.stroke();
          }
          // Bottom edge
          if (!wallBelow) {
            ctx.beginPath(); ctx.moveTo(x, y + CELL); ctx.lineTo(x + CELL, y + CELL); ctx.stroke();
          }
          // Left edge (only leftmost column in a pair)
          if (isFirst) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + CELL); ctx.stroke();
          }
          // Right edge (only rightmost column in a pair)
          if (isLast) {
            ctx.beginPath(); ctx.moveTo(x + CELL, y); ctx.lineTo(x + CELL, y + CELL); ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  /* Outer border (matches CSS border radius area) */
  function drawFrame() {
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, HTOP - 1, CW - 1, CH - HTOP + 0.5);
  }

  /* Power-pellet pulse */
  let pulseT = 0;
  function drawPowerPellets() {
    pulseT++;
    const alpha = 0.5 + 0.5 * Math.sin(pulseT * 0.12);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (maze[r][c] !== T.POWER) continue;
        const x = c * S + GAP + CELL / 2;
        const y = HTOP + r * S + GAP + CELL / 2;
        ctx.beginPath();
        ctx.arc(x, y, CELL / 2 + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#39d353';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ──────────────────────────────────────────────────────────────────
     RENDER FRAME
  ────────────────────────────────────────────────────────────────── */
  function render() {
    // Clear
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CW, CH);

    drawMonthLabels();
    drawFrame();
    drawGrid();
    drawPowerPellets();
    drawWallLines();

    // Entities
    for (const g of ghosts) g.draw();
    pac.draw();

    // Fright timer bar
    if (frightLeft > 0 && state === 'playing') {
      const pct = frightLeft / FRIGHT_DUR;
      const bw  = 60, bh = 4;
      const bx  = CW - bw - 6, by = HTOP - bh - 3;
      ctx.fillStyle = '#21262d';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.3 ? '#58a6ff' : '#f78166';
      ctx.fillRect(bx, by, bw * pct, bh);
    }

    // Pause dim
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(13,17,23,.7)';
      ctx.fillRect(0, HTOP, CW, CH - HTOP);
      ctx.font      = 'bold 16px "Segoe UI",sans-serif';
      ctx.fillStyle = '#39d353';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏸  PAUSED  —  press P to resume', CW / 2, (CH + HTOP) / 2);
    }
  }

  /* ──────────────────────────────────────────────────────────────────
     GAME LOOP
  ────────────────────────────────────────────────────────────────── */
  function loop() {
    if (state === 'playing') {
      if (frightLeft > 0) frightLeft--;
      pac.update();
      for (const g of ghosts) g.update();
    }
    render();
    requestAnimationFrame(loop);
  }

  /* ──────────────────────────────────────────────────────────────────
     START / RESTART
  ────────────────────────────────────────────────────────────────── */
  window.startGame = function () {
    score = 0; lives = 3; frightLeft = 0;
    resetMaze();
    pelletsLeft = countPellets();
    pac.snap();
    mkGhosts();
    state = 'playing';
    hideOverlay();
    syncUI();
  };

  /* ──────────────────────────────────────────────────────────────────
     KEYBOARD INPUT
  ────────────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowRight': case 'd': case 'D': pac.setDir(D.R); e.preventDefault(); break;
      case 'ArrowLeft':  case 'a': case 'A': pac.setDir(D.L); e.preventDefault(); break;
      case 'ArrowDown':  case 's': case 'S': pac.setDir(D.D); e.preventDefault(); break;
      case 'ArrowUp':    case 'w': case 'W': pac.setDir(D.U); e.preventDefault(); break;
      case 'p': case 'P':
        if (state === 'playing') state = 'paused';
        else if (state === 'paused') state = 'playing';
        break;
      case 'r': case 'R': window.startGame(); break;
      case 'Enter':
        if (state !== 'playing') window.startGame();
        break;
    }
  });

  /* ──────────────────────────────────────────────────────────────────
     TOUCH / SWIPE SUPPORT
  ────────────────────────────────────────────────────────────────── */
  let touchOrigin = null;
  canvas.addEventListener('touchstart', e => {
    touchOrigin = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (!touchOrigin) return;
    const dx = e.changedTouches[0].clientX - touchOrigin.x;
    const dy = e.changedTouches[0].clientY - touchOrigin.y;
    if (Math.abs(dx) > Math.abs(dy)) pac.setDir(dx > 0 ? D.R : D.L);
    else                             pac.setDir(dy > 0 ? D.D : D.U);
    touchOrigin = null;
    e.preventDefault();
  }, { passive: false });

  /* ──────────────────────────────────────────────────────────────────
     BOOT
  ────────────────────────────────────────────────────────────────── */
  resetMaze();
  pelletsLeft = countPellets();
  pac.snap();
  mkGhosts();
  syncUI();
  requestAnimationFrame(loop);   // Start rendering (shows start overlay)

})();

#!/usr/bin/env python3
"""
generate_svg.py
───────────────
Generates an animated GitHub Contribution Graph Pac-Man SVG
that can be embedded in a GitHub profile README.

Usage:
  python generate_svg.py --username YOUR_GITHUB_USERNAME
  python generate_svg.py --username YOUR_GITHUB_USERNAME --output pacman.svg
  python generate_svg.py --demo   (random data, no GitHub API needed)

The SVG will be saved and can be embedded in README.md like:
  ![Pac-Man](./pacman.svg)
"""

import argparse
import json
import math
import random
import sys
import urllib.request
import urllib.error
from xml.sax.saxutils import escape

# ─── Layout (mirrors game.js) ────────────────────────────────────────────────
CELL   = 11
GAP    = 3
S      = CELL + GAP      # 14 px per step
COLS   = 52
ROWS   = 7
HEADER = 24
W      = COLS * S + GAP  # 729
H      = ROWS * S + GAP + HEADER  # 126

MONTHS = ['Dec','Jan','Feb','Mar','Apr','May','Jun',
          'Jul','Aug','Sep','Oct','Nov']
MCOL   = [0, 4, 9, 13, 18, 22, 27, 31, 36, 40, 44, 48]

# ─── Colours ─────────────────────────────────────────────────────────────────
BG         = '#0d1117'
CELL_EMPTY = '#161b22'
DOT        = ['#0e4429', '#006d32', '#26a641', '#39d353']
POWER_CLR  = '#39d353'
WALL_LINE  = '#e6edf3'
TEXT_CLR   = '#8b949e'
PAC_CLR    = '#f8c535'
GHOST_CLRS = ['#58a6ff', '#79c0ff', '#388bfd']
BORDER_CLR = '#30363d'

# ─── Wall definitions ─────────────────────────────────────────────────────────
WALL_DEFS = [
    {'cols': [8,  9],  'gap': 0},
    {'cols': [17, 18], 'gap': 6},
    {'cols': [26, 27], 'gap': 0},
    {'cols': [35, 36], 'gap': 6},
    {'cols': [44, 45], 'gap': 0},
]

wall_map = {}
for wd in WALL_DEFS:
    for col in wd['cols']:
        wall_map[col] = wd['gap']

def is_wall(c, r):
    return c in wall_map and wall_map[c] != r

# ─── Pixel helpers ────────────────────────────────────────────────────────────
def px(c):  return c * S + GAP
def py(r):  return HEADER + r * S + GAP
def cpx(c): return px(c) + CELL / 2
def cpy(r): return py(r) + CELL / 2

# ─── Fetch contribution data ──────────────────────────────────────────────────
def fetch_contributions(username):
    """Use the unofficial contributions API (no auth needed)."""
    url = f'https://github-contributions-api.jogruber.de/v4/{username}?y=last'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'pacman-svg/1.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read())
        return data.get('contributions', [])
    except Exception as e:
        print(f'WARNING: Could not fetch contributions: {e}', file=sys.stderr)
        return None

def build_grid(raw):
    """Turn API response into a COLS×ROWS grid of levels 0-3."""
    grid = [[0]*COLS for _ in range(ROWS)]
    if raw:
        for i, item in enumerate(raw):
            col = i // 7
            row = i % 7
            if 0 <= col < COLS and 0 <= row < ROWS:
                cnt = item.get('count', 0)
                if   cnt == 0: lvl = 0
                elif cnt <= 3: lvl = 1
                elif cnt <= 6: lvl = 2
                else:          lvl = 3
                grid[row][col] = lvl
    else:
        # Random demo data
        for r in range(ROWS):
            for c in range(COLS):
                if not is_wall(c, r):
                    grid[r][c] = random.choices([0,1,2,3],
                                                weights=[20,25,30,25])[0]
    return grid

# ─── Animation path (snake through all rows) ─────────────────────────────────
def build_path(grid):
    """
    Build ordered list of cells Pac-Man visits.
    Pattern: row 0 left→right, row 1 right→left, ... snake.
    """
    path = []
    for r in range(ROWS):
        cols = range(COLS) if r % 2 == 0 else range(COLS-1, -1, -1)
        for c in cols:
            if not is_wall(c, r) and grid[r][c] > 0:
                facing = 'right' if r % 2 == 0 else 'left'
                path.append({'col': c, 'row': r, 'facing': facing})
    return path

# ─── SVG building ─────────────────────────────────────────────────────────────
def fmt(v): return f'{v:.2f}'.rstrip('0').rstrip('.')

def generate_svg(grid, username='', out='pacman.svg'):
    path = build_path(grid)
    if not path:
        print('No cells to animate.')
        return

    dt   = 0.10          # seconds per cell
    total = len(path) * dt
    dur   = f'{total:.1f}s'

    # ── Key times and positions for Pac-Man ──
    n = len(path)
    kts  = ';'.join(f'{i/(n-1):.4f}' for i in range(n))
    kxs  = ';'.join(fmt(cpx(p['col'])) for p in path)
    kys  = ';'.join(fmt(cpy(p['row'])) for p in path)

    # Rotation keyframes  (0=right, 180=left, 90=down, -90=up)
    dir_angles = {'right': 0, 'left': 180, 'down': 90, 'up': -90}
    krs = ';'.join(str(dir_angles.get(p['facing'], 0)) for p in path)

    # ── Cell eat timings (each cell turns gray when Pac-Man arrives) ──
    eat_anims = []
    for i, p in enumerate(path):
        cid  = f'c{p["row"]}-{p["col"]}'
        t0   = f'{i * dt:.2f}s'
        lvl  = grid[p['row']][p['col']]
        from_clr = DOT[lvl] if lvl > 0 else POWER_CLR
        eat_anims.append(
            f'<animate href="#{cid}" attributeName="fill" '
            f'from="{from_clr}" to="{CELL_EMPTY}" '
            f'begin="{t0}" dur="0.08s" fill="freeze" '
            f'repeatCount="1"/>'
        )

    # ── Ghost paths (simple oscillation) ──
    ghost_elems = []
    for gi, (gc, gcol, grow) in enumerate(zip(GHOST_CLRS, [13, 26, 40], [3, 3, 3])):
        gx   = fmt(cpx(gcol))
        gy   = fmt(cpy(grow))
        amp  = 60
        d1   = fmt(cpx(gcol) - amp)
        d2   = fmt(cpx(gcol) + amp)
        gdur = f'{8 + gi * 2}s'
        r_g  = CELL // 2 - 1

        ghost_elems.append(f'''
  <g opacity="0.92">
    <!-- ghost body -->
    <circle r="{r_g}" fill="{gc}">
      <animateMotion dur="{gdur}" repeatCount="indefinite" calcMode="spline"
        keySplines="0.5 0 0.5 1;0.5 0 0.5 1"
        keyTimes="0;0.5;1"
        path="M {gx},{gy} L {d2},{gy} L {d1},{gy}"/>
    </circle>
    <!-- white eyes -->
    <ellipse rx="{r_g*0.22:.1f}" ry="{r_g*0.28:.1f}" fill="white">
      <animateMotion dur="{gdur}" repeatCount="indefinite" calcMode="spline"
        keySplines="0.5 0 0.5 1;0.5 0 0.5 1" keyTimes="0;0.5;1"
        path="M {cpx(gcol)-r_g*0.28:.2f},{cpy(grow)-.0:.2f} L {cpx(gcol)+amp-r_g*0.28:.2f},{cpy(grow):.2f} L {cpx(gcol)-amp-r_g*0.28:.2f},{cpy(grow):.2f}"/>
    </ellipse>
    <ellipse rx="{r_g*0.22:.1f}" ry="{r_g*0.28:.1f}" fill="white">
      <animateMotion dur="{gdur}" repeatCount="indefinite" calcMode="spline"
        keySplines="0.5 0 0.5 1;0.5 0 0.5 1" keyTimes="0;0.5;1"
        path="M {cpx(gcol)+r_g*0.28:.2f},{cpy(grow):.2f} L {cpx(gcol)+amp+r_g*0.28:.2f},{cpy(grow):.2f} L {cpx(gcol)-amp+r_g*0.28:.2f},{cpy(grow):.2f}"/>
    </ellipse>
  </g>''')

    # ── Assemble SVG ──
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{W}" height="{H}" viewBox="0 0 {W} {H}">',

        f'  <title>GitHub Contribution Pac-Man'
        f'{"  @" + escape(username) if username else ""}</title>',

        # Background
        f'  <rect width="{W}" height="{H}" fill="{BG}" rx="6"/>',

        # Month labels
        '  <g font-family="&quot;Segoe UI&quot;,Helvetica,sans-serif" '
        f'font-size="10" fill="{TEXT_CLR}">',
    ]
    for month, mc in zip(MONTHS, MCOL):
        lines.append(f'    <text x="{px(mc)}" y="14">{escape(month)}</text>')
    lines.append('  </g>')

    # Grid cells
    lines.append('  <g id="grid">')
    for r in range(ROWS):
        for c in range(COLS):
            if is_wall(c, r):
                continue
            lvl   = grid[r][c]
            color = DOT[lvl] if lvl > 0 else CELL_EMPTY
            cid   = f'c{r}-{c}'
            lines.append(
                f'    <rect id="{cid}" x="{px(c)}" y="{py(r)}" '
                f'width="{CELL}" height="{CELL}" rx="2" fill="{color}"/>'
            )
    lines.append('  </g>')

    # Wall outlines
    lines.append(f'  <g stroke="{WALL_LINE}" stroke-width="1.5" stroke-linecap="round">')
    for wd in WALL_DEFS:
        left_col  = wd['cols'][0]
        right_col = wd['cols'][-1]
        for col in wd['cols']:
            gap = wd['gap']
            is_first = col == left_col
            is_last  = col == right_col
            for r in range(ROWS):
                if r == gap:
                    continue
                x = px(col); y = py(r)
                wall_above = r > 0      and r - 1 != gap
                wall_below = r < ROWS-1 and r + 1 != gap
                if not wall_above:
                    lines.append(f'    <line x1="{x}" y1="{y}" x2="{x+CELL}" y2="{y}"/>')
                if not wall_below:
                    lines.append(f'    <line x1="{x}" y1="{y+CELL}" x2="{x+CELL}" y2="{y+CELL}"/>')
                if is_first:
                    lines.append(f'    <line x1="{x}" y1="{y}" x2="{x}" y2="{y+CELL}"/>')
                if is_last:
                    lines.append(f'    <line x1="{x+CELL}" y1="{y}" x2="{x+CELL}" y2="{y+CELL}"/>')
    lines.append('  </g>')

    # Cell eating animations
    lines.append('  <g id="eat-anims">')
    for a in eat_anims:
        lines.append('    ' + a)
    lines.append('  </g>')

    # Ghosts
    for ge in ghost_elems:
        lines.append(ge)

    # Pac-Man
    r_p = CELL // 2 - 1
    lines.append(f'''
  <g id="pacman">
    <g>
      <!-- Pac-Man body (circle with mouth cutout) -->
      <circle r="{r_p}" fill="{PAC_CLR}"/>
      <!-- Mouth wedge overlay -->
      <polygon points="0,0 {r_p},{-r_p*0.45:.2f} {r_p},{r_p*0.45:.2f}"
               fill="{BG}">
        <animateTransform attributeName="transform" type="rotate"
          values="0;18;0" keyTimes="0;0.5;1" dur="0.45s"
          repeatCount="indefinite"/>
      </polygon>
      <!-- Position animation -->
      <animateMotion dur="{dur}" keyTimes="{kts}"
        values="{';'.join(f'{kxs.split(";")[i]},{kys.split(";")[i]}' for i in range(n))}"
        calcMode="linear" repeatCount="indefinite"/>
    </g>
  </g>''')

    # Outer border
    lines.append(f'  <rect width="{W}" height="{H}" rx="6" fill="none" '
                 f'stroke="{BORDER_CLR}" stroke-width="1"/>')

    lines.append('</svg>')

    content = '\n'.join(lines)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(content)

    size_kb = len(content.encode()) / 1024
    print(f'[OK] Saved {out}  ({size_kb:.1f} KB, {len(path)} cells animated)')

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Generate a GitHub Contribution Pac-Man animated SVG')
    parser.add_argument('--username', '-u',
                        help='GitHub username (fetches real contribution data)')
    parser.add_argument('--output', '-o', default='pacman.svg',
                        help='Output file path (default: pacman.svg)')
    parser.add_argument('--demo', action='store_true',
                        help='Use random demo data (no GitHub username needed)')
    args = parser.parse_args()

    raw = None
    if args.username and not args.demo:
        print(f'Fetching contributions for @{args.username} ...')
        raw = fetch_contributions(args.username)

    grid = build_grid(raw)
    generate_svg(grid, username=args.username or '', out=args.output)

if __name__ == '__main__':
    main()

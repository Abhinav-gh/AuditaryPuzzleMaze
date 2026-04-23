// mazeData.js — Two levels with full puzzle type set
// Cell types:
//  0 = PATH    — walkable
//  1 = WALL    — impassable
//  2 = EXIT    — goal
//  3 = WORDLE  — Audio Wordle (phonetic word puzzle)
//  4 = CHORD   — Chord Puzzle (piano keys held simultaneously)
//  5 = DANGER  — Monster (growl warning when adjacent, pushes back on step)
//  6 = RHYTHM  — Rhythm Puzzle (tap Space to match a beat pattern)
//  7 = SIMON   — Simon Says (repeat note sequence with arrow keys)

export const CELL = {
  PATH:   0,
  WALL:   1,
  EXIT:   2,
  WORDLE: 3,
  CHORD:  4,
  DANGER: 5,
  RHYTHM: 6,
  SIMON:  7,
};

export const CELL_IS_PUZZLE = (t) => [3, 4, 6, 7].includes(t);
export const CELL_IS_PASSABLE = (t) => t !== CELL.WALL; // danger is "passable" (pushes back)

// ─── Level 1: 3×3 — The Forest Path ──────────────────────────────────────
// Simple intro maze. One optional rhythm puzzle. Clear exit.
// Verified paths:
//   Direct:  (0,0)→(1,0)→(2,0)→(2,1)→(2,2)  EXIT
//   Through puzzle: (0,0)→(0,1)→(0,2)→(1,2)→(2,2)  EXIT (avoids (2,1) wall)
//   Puzzle:  (0,0)→(0,1)→(1,1)[RHYTHM]→(1,2)→(2,2) EXIT
const MAZE_L1 = [
  [0, 0, 0],   // Row 0: all open
  [0, 6, 0],   // Row 1: RHYTHM puzzle at (1,1)
  [0, 0, 2],   // Row 2: EXIT at (2,2)
];

// ─── Level 2: 5×5 — The Ancient Ruins ─────────────────────────────────────
// Verified paths (multiple routes, all puzzles optional with alternate route):
//   Route A (chord fast-lane): (0,0)→(1,0)→(2,0)→(3,0)[CHORD]→(4,0)→(4,1)→(4,2)→(4,3)→(4,4)[EXIT]
//   Route B (wordle+simon):    (0,0)→(0,1)→(0,2)[WORDLE]→(0,3)→(1,3)→(2,3)→(2,4)[SIMON]→(3,4)[WORDLE]→(4,4)
//   Route C (rhythm+right):    (2,0)→(2,1)→(2,2)[RHYTHM]→(3,2)→(4,2)→(4,3)→(4,4)
//   Danger avoidable:          (1,1) and (3,3) — listen for growl and sidestep
const MAZE_L2 = [
  [0, 0, 0, 4, 0],   // Row 0: CHORD at (3,0)
  [0, 5, 0, 1, 0],   // Row 1: DANGER at (1,1) | WALL at (3,1)
  [3, 1, 6, 0, 0],   // Row 2: WORDLE at (0,2) | WALL at (1,2) | RHYTHM at (2,2)
  [0, 0, 0, 5, 0],   // Row 3: DANGER at (3,3)
  [1, 0, 7, 3, 2],   // Row 4: WALL at (0,4) | SIMON at (2,4) | WORDLE at (3,4) | EXIT at (4,4)
];

export const LEVELS = [
  {
    id: 1,
    name: 'Level 1 – The Forest Path',
    description: 'A simple 3×3 maze to warm up your ears. One optional puzzle.',
    maze: MAZE_L1,
    rows: 3,
    cols: 3,
    start: { x: 0, y: 0 },
    exit:  { x: 2, y: 2 },
  },
  {
    id: 2,
    name: 'Level 2 – The Ancient Ruins',
    description: 'A complex 5×5 maze. Word, Chord, Rhythm, and Simon puzzles await. Danger lurks.',
    maze: MAZE_L2,
    rows: 5,
    cols: 5,
    start: { x: 0, y: 0 },
    exit:  { x: 4, y: 4 },
  },
];

// ─── Helpers (accept level object) ─────────────────────────────────────────
export function getCell(level, x, y) {
  if (!level || y < 0 || y >= level.rows || x < 0 || x >= level.cols) return null;
  return level.maze[y][x];
}

export function getAdjacentDangers(level, x, y) {
  const dirs = [
    { dx: 0, dy: -1, dir: 'north' },
    { dx: 0, dy:  1, dir: 'south' },
    { dx: -1, dy: 0, dir: 'west'  },
    { dx:  1, dy: 0, dir: 'east'  },
  ];
  return dirs
    .filter(({ dx, dy }) => getCell(level, x + dx, y + dy) === CELL.DANGER)
    .map(({ dx, dy, dir }) => ({ x: x + dx, y: y + dy, dir }));
}

export function getOpenDirections(level, x, y) {
  const dirs = [
    { dx: 0, dy: -1, label: 'north' },
    { dx: 0, dy:  1, label: 'south' },
    { dx: -1, dy: 0, label: 'west'  },
    { dx:  1, dy: 0, label: 'east'  },
  ];
  return dirs.filter(({ dx, dy }) => {
    const c = getCell(level, x + dx, y + dy);
    return c !== null && c !== CELL.WALL;
  }).map(d => d.label);
}

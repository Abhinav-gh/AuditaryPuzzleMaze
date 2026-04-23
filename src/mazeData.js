// mazeData.js
// Cell types:
//  0 = path (walkable)
//  1 = wall
//  2 = exit
//  3 = puzzle cell (triggers Audio Wordle)
//
// Grid is [row][col], origin top-left (0,0)
// Player starts at (col=0, row=0), exit at (col=4, row=4)

export const MAZE = [
  [0, 1, 0, 0, 0],
  [0, 0, 3, 1, 0],
  [1, 0, 1, 0, 0],
  [0, 0, 0, 3, 1],
  [0, 1, 0, 0, 2],
];

export const ROWS = 5;
export const COLS = 5;
export const START = { x: 0, y: 0 };  // x=col, y=row
export const EXIT  = { x: 4, y: 4 };

export const CELL = {
  PATH:   0,
  WALL:   1,
  EXIT:   2,
  PUZZLE: 3,
};

export function getCell(x, y) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return null;
  return MAZE[y][x];
}

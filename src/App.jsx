// App.jsx — Puzzle Maze v4
// Systems:
//  - Level select (Level 1: 3×3 | Level 2: 5×5)
//  - Ambient audio per cell type (stops on move, starts on new cell)
//  - Mouse hover direction scanning (play cell-type preview sound when hovering adjacent cells)
//  - I key = repeat full context-aware instructions
//  - P key = on-demand directional ping to exit
//  - prevPos tracking: puzzle skip reverts player
//  - 4 puzzle types: wordle | chord | rhythm | simon
//  - Danger adjacent growl + visual alert

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AudioManager } from './AudioManager';
import { AudioWordle } from './AudioWordle';
import { ChordPuzzle } from './ChordPuzzle';
import { RhythmPuzzle } from './RhythmPuzzle';
import { SimonPuzzle } from './SimonPuzzle';
import { useTTS } from './useTTS';
import {
  LEVELS, CELL, CELL_IS_PUZZLE, getCell, getAdjacentDangers, getOpenDirections
} from './mazeData';
import './index.css';

const DIRECTIONS = {
  ArrowUp:    { dx: 0, dy: -1, label: 'north' }, W: { dx: 0, dy: -1, label: 'north' }, w: { dx: 0, dy: -1, label: 'north' },
  ArrowDown:  { dx: 0, dy:  1, label: 'south' }, S: { dx: 0, dy:  1, label: 'south' }, s: { dx: 0, dy:  1, label: 'south' },
  ArrowLeft:  { dx: -1, dy: 0, label: 'west'  }, A: { dx: -1, dy: 0, label: 'west'  }, a: { dx: -1, dy: 0, label: 'west'  },
  ArrowRight: { dx: 1,  dy: 0, label: 'east'  }, D: { dx: 1,  dy: 0, label: 'east'  }, d: { dx: 1,  dy: 0, label: 'east'  },
};

function getDistance(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function getExitDirection(px, py, exit) {
  const dx = exit.x - px, dy = exit.y - py;
  return [dy < 0 && 'north', dy > 0 && 'south', dx > 0 && 'east', dx < 0 && 'west']
    .filter(Boolean).join('-') || 'here';
}

function dirToPan(dir) {
  return dir === 'east' ? 0.8 : dir === 'west' ? -0.8 : 0;
}

// Context-aware instruction text
function buildInstructions(phase, levelId) {
  if (phase === 'level-select') {
    return `Level select screen. Press 1 for ${LEVELS[0].name}, ${LEVELS[0].description}. Press 2 for ${LEVELS[1].name}, ${LEVELS[1].description}. Press I at any time to repeat instructions.`;
  }
  if (phase === 'playing') {
    return `You are playing ${LEVELS[levelId - 1]?.name ?? 'the maze'}. Move with Arrow keys or W, A, S, D. Press P for a directional ping toward the exit. Move your mouse over adjacent cells to preview their sound. Press I to hear these instructions again. Puzzle cells start a mini game. Press Escape to skip a puzzle and be moved back to your previous position. Danger cells will growl when adjacent — avoid them!`;
  }
  if (phase === 'wordle') {
    return `Word puzzle. Listen to the phonetic letter clues. Type a 3-letter word on your keyboard and press Enter. Press R to replay the audio clue. Press Escape to skip and be moved back.`;
  }
  if (phase === 'chord') {
    return `Chord puzzle. Your A through K keys are piano keys. Hold 3 keys simultaneously to play a chord. Match the target chord to solve. Press R to replay the target. Press Escape to skip and be moved back.`;
  }
  if (phase === 'rhythm') {
    return `Rhythm puzzle. Listen to the beat pattern. When it's your turn, tap Space to reproduce the rhythm. Press R to replay the pattern. Press Escape to skip.`;
  }
  if (phase === 'simon') {
    return `Simon Says puzzle. Listen to the arrow-key note sequence. Repeat it using your arrow keys in the same order. Press R to replay. Press Escape to skip.`;
  }
  return `Puzzle Maze. Select a level to begin.`;
}

// Ambient type for a cell
function ambientFor(cellType, nearDanger) {
  if (nearDanger) return 'danger_adj';
  switch (cellType) {
    case CELL.EXIT:   return 'exit';
    case CELL.WORDLE: return 'wordle';
    case CELL.CHORD:  return 'chord';
    case CELL.RHYTHM: return 'rhythm';
    case CELL.SIMON:  return 'simon';
    default:          return 'path';
  }
}

// Phase → puzzle component map
const PUZZLE_PHASE_MAP = {
  wordle: CELL.WORDLE,
  chord:  CELL.CHORD,
  rhythm: CELL.RHYTHM,
  simon:  CELL.SIMON,
};

export default function App() {
  const [screen, setScreen] = useState('splash'); // splash | level-select | playing | won
  const [phase, setPhase]   = useState('menu');   // subset: playing | wordle | chord | rhythm | simon
  const [level, setLevel]   = useState(null);     // LEVELS[i]
  const [pos, setPos]       = useState({ x: 0, y: 0 });
  const [moves, setMoves]   = useState(0);
  const [narrative, setNarrative] = useState('Welcome to Puzzle Maze.');
  const [log, setLog]             = useState([]);
  const [solvedPuzzles, setSolvedPuzzles] = useState({});
  const [visitedCells, setVisitedCells]  = useState(new Set(['0,0']));
  const [nearDanger, setNearDanger]      = useState([]);

  const audioRef   = useRef(null);
  const prevPosRef = useRef({ x: 0, y: 0 });
  const posRef     = useRef({ x: 0, y: 0 });
  const phaseRef   = useRef('menu');
  const levelRef   = useRef(null);

  const { speak, cancel } = useTTS();

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { levelRef.current = level; }, [level]);

  useEffect(() => { audioRef.current = new AudioManager(); }, []);

  const addLog = useCallback((msg) => {
    setLog(prev => [msg, ...prev].slice(0, 10));
    setNarrative(msg);
  }, []);

  // ── Ambient update on each position/danger change ────────────────────────
  const updateAmbient = useCallback((lv, x, y, dangers) => {
    if (!lv || !audioRef.current) return;
    const ct = getCell(lv, x, y);
    const ambType = ambientFor(ct, dangers.length > 0);
    audioRef.current.stopAmbient();
    audioRef.current.playAmbient(ambType);
  }, []);

  // ── Danger check after each move ─────────────────────────────────────────
  const checkDanger = useCallback((lv, x, y) => {
    const dangers = getAdjacentDangers(lv, x, y);
    setNearDanger(dangers);
    if (dangers.length > 0) {
      dangers.forEach(({ dir }) => audioRef.current.playDangerGrowl(dirToPan(dir), 0.45));
      const dirs = dangers.map(d => d.dir).join(' and ');
      addLog(`⚠️ Danger growling to the ${dirs}!`);
      speak(`Warning! Something dangerous is nearby to the ${dirs}. Stay alert!`, { priority: true });
      return dangers;
    }
    return [];
  }, [addLog, speak]);

  // ── Start a level ─────────────────────────────────────────────────────────
  const startLevel = async (lv) => {
    await audioRef.current.init();
    setLevel(lv);
    levelRef.current = lv;
    setScreen('playing');
    setPhase('playing');
    setPos(lv.start);
    prevPosRef.current = lv.start;
    posRef.current = lv.start;
    setMoves(0);
    setVisitedCells(new Set([`${lv.start.x},${lv.start.y}`]));
    setSolvedPuzzles({});
    setNearDanger([]);
    setLog([]);
    const dangers = checkDanger(lv, lv.start.x, lv.start.y);
    updateAmbient(lv, lv.start.x, lv.start.y, dangers);

    const intro = buildInstructions('playing', lv.id);
    addLog(`${lv.name} started!`);
    speak(intro, { priority: true });
  };

  const resetToMenu = () => {
    cancel(); window.speechSynthesis?.cancel();
    try { audioRef.current?.stopAll(); } catch {}
    audioRef.current = new AudioManager();
    setScreen('splash'); setPhase('menu'); setLevel(null);
    setNarrative('Welcome to Puzzle Maze.'); setLog([]);
    setSolvedPuzzles({}); setVisitedCells(new Set(['0,0']));
    setPos({ x: 0, y: 0 }); setNearDanger([]);
  };

  // ── Instructions (I key) ──────────────────────────────────────────────────
  const speakInstructions = useCallback(() => {
    window.speechSynthesis?.cancel();
    const text = buildInstructions(phaseRef.current, levelRef.current?.id ?? 1);
    speak(text, { priority: true });
  }, [speak]);

  // ── Keyboard movement ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    const handleKey = (e) => {
      // I = instructions
      if (e.key === 'i' || e.key === 'I') { speakInstructions(); return; }

      // P = ping
      if (e.key === 'p' || e.key === 'P') {
        const lv = levelRef.current; const cur = posRef.current;
        if (!lv) return;
        const exitDir = getExitDirection(cur.x, cur.y, lv.exit);
        const dist = getDistance(cur.x, cur.y, lv.exit.x, lv.exit.y);
        audioRef.current.playPing(exitDir, dist);
        addLog(`📡 Ping → ${exitDir} (${dist.toFixed(1)} away)`);
        speak(`Exit is to the ${exitDir.replace('-', ' ')}. Distance ${dist.toFixed(1)} cells.`);
        return;
      }

      const dir = DIRECTIONS[e.key];
      if (!dir) return;
      e.preventDefault();

      const lv = levelRef.current; const { x, y } = posRef.current;
      if (!lv) return;
      const newX = x + dir.dx, newY = y + dir.dy;

      // Boundary
      if (newX < 0 || newX >= lv.cols || newY < 0 || newY >= lv.rows) {
        audioRef.current.playWallBump();
        addLog(`🚧 Boundary to the ${dir.label}`);
        speak(`Boundary to the ${dir.label}.`, { priority: true });
        return;
      }

      const cellType = getCell(lv, newX, newY);

      if (cellType === CELL.WALL) {
        audioRef.current.playWallBump();
        addLog(`🧱 Wall to the ${dir.label}`);
        speak(`Wall to the ${dir.label}. Try another direction.`, { priority: true });
        return;
      }

      if (cellType === CELL.DANGER) {
        // Stay in place, play hit sound
        audioRef.current.playDangerHit();
        addLog(`💀 Stepped on DANGER — pushed back!`);
        speak(`You stepped on a creature and were pushed back! Don't go there!`, { priority: true });
        return;
      }

      // Commit move
      prevPosRef.current = { x, y };
      const newPos = { x: newX, y: newY };
      setPos(newPos);
      posRef.current = newPos;
      setMoves(m => m + 1);
      setVisitedCells(prev => new Set([...prev, `${newX},${newY}`]));

      // Exit?
      if (cellType === CELL.EXIT) {
        audioRef.current.stopAmbient();
        audioRef.current.playVictory();
        setScreen('won');
        addLog(`🏆 EXIT REACHED!`);
        speak(`Congratulations! You escaped the maze in ${moves + 1} moves. Well done!`, { priority: true });
        return;
      }

      // Puzzle cell (unsolved)?
      if (CELL_IS_PUZZLE(cellType) && !solvedPuzzles[`${newX},${newY}`]) {
        audioRef.current.playPuzzleFound();
        const phaseName = {
          [CELL.WORDLE]: 'wordle', [CELL.CHORD]: 'chord',
          [CELL.RHYTHM]: 'rhythm', [CELL.SIMON]: 'simon',
        }[cellType];
        const kindLabel = {
          [CELL.WORDLE]: 'Word', [CELL.CHORD]: 'Chord',
          [CELL.RHYTHM]: 'Rhythm', [CELL.SIMON]: 'Simon Says',
        }[cellType];
        addLog(`🔐 ${kindLabel} Puzzle at (${newX},${newY})`);
        speak(`${kindLabel} puzzle found! Solve it to unlock the path. Press Escape to skip and be moved back. Press R to replay the clue.`, { priority: true });
        setPhase(phaseName);
        audioRef.current.stopAmbient();
        audioRef.current.playAmbient(phaseName);
        return;
      }

      // Normal step or solved puzzle passthrough
      if (cellType === CELL.EXIT) {
        // handled above
      } else if (CELL_IS_PUZZLE(cellType) && solvedPuzzles[`${newX},${newY}`]) {
        audioRef.current.playCoin();
      } else {
        audioRef.current.playFootstep();
      }

      const dangers = checkDanger(lv, newX, newY);
      updateAmbient(lv, newX, newY, dangers);

      const openD = getOpenDirections(lv, newX, newY).join(', ') || 'none';
      addLog(`👣 Moved ${dir.label} → (${newX},${newY})`);
      speak(`Moved ${dir.label}. Column ${newX + 1}, row ${newY + 1}. Open paths: ${openD}.`);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, moves, solvedPuzzles, speak, addLog, checkDanger, updateAmbient, speakInstructions]);

  // I key in puzzle overlays
  useEffect(() => {
    if (!['wordle', 'chord', 'rhythm', 'simon'].includes(phase)) return;
    const handler = (e) => {
      if (e.key === 'i' || e.key === 'I') speakInstructions();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, speakInstructions]);

  // ── Puzzle callbacks ──────────────────────────────────────────────────────
  const handlePuzzleSolve = useCallback(() => {
    const { x, y } = posRef.current;
    setSolvedPuzzles(prev => ({ ...prev, [`${x},${y}`]: true }));
    setPhase('playing');
    audioRef.current.playCorrect();
    const lv = levelRef.current;
    const dangers = getAdjacentDangers(lv, x, y);
    setNearDanger(dangers);
    updateAmbient(lv, x, y, dangers);
    addLog('✅ Puzzle solved — path unlocked!');
    speak(`Excellent! Puzzle solved and path unlocked! Keep going!`, { priority: true });
  }, [addLog, speak, updateAmbient]);

  const handlePuzzleSkip = useCallback(() => {
    const prev = prevPosRef.current;
    setPos(prev); posRef.current = prev;
    setPhase('playing');
    const lv = levelRef.current;
    const dangers = getAdjacentDangers(lv, prev.x, prev.y);
    setNearDanger(dangers);
    updateAmbient(lv, prev.x, prev.y, dangers);
    addLog(`⏭️ Skipped — back to (${prev.x},${prev.y})`);
    speak(`Puzzle skipped. You've been moved back. Find another route or return to try again.`, { priority: true });
  }, [addLog, speak, updateAmbient]);

  // ── Mouse hover preview ───────────────────────────────────────────────────
  // Plays a brief audio preview when hovering over an adjacent cell
  const handleCellHover = useCallback((cellType, cx, cy) => {
    if (phase !== 'playing') return;
    const { x, y } = posRef.current;
    const isAdjacent = Math.abs(cx - x) + Math.abs(cy - y) === 1;
    if (!isAdjacent) return;
    const dir = cx > x ? 'east' : cx < x ? 'west' : cy > y ? 'south' : 'north';
    audioRef.current?.playHoverPreview(cellType, dir);
  }, [phase]);

  // ── Derived values ────────────────────────────────────────────────────────
  const lv = level;
  const isInGame = screen === 'playing';
  const exitDist = (isInGame && lv) ? getDistance(pos.x, pos.y, lv.exit.x, lv.exit.y).toFixed(1) : '—';
  const exitDir  = (isInGame && lv) ? getExitDirection(pos.x, pos.y, lv.exit) : '—';
  const openDirs = (isInGame && lv) ? (getOpenDirections(lv, pos.x, pos.y).join(', ') || 'none') : '—';

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderMaze() {
    if (!lv) return null;
    return (
      <div className="maze-grid" style={{ '--cols': lv.cols }}>
        {lv.maze.flatMap((row, ry) =>
          row.map((cell, cx) => {
            const isPlayer  = pos.x === cx && pos.y === ry;
            const isExit    = cx === lv.exit.x && ry === lv.exit.y;
            const visited   = visitedCells.has(`${cx},${ry}`);
            const pSolved   = solvedPuzzles[`${cx},${ry}`];
            const isDanger  = cell === CELL.DANGER;
            const isNearD   = nearDanger.some(d => d.x === cx && d.y === ry);

            let cls = 'maze-cell';
            if (cell === CELL.WALL)                        cls += ' cell-wall';
            else if (isExit)                               cls += ' cell-exit';
            else if (isDanger)                             cls += ` cell-danger${isNearD ? ' cell-danger-alert' : ''}`;
            else if (cell === CELL.WORDLE && !pSolved)     cls += ' cell-puzzle';
            else if (cell === CELL.CHORD  && !pSolved)     cls += ' cell-chord';
            else if (cell === CELL.RHYTHM && !pSolved)     cls += ' cell-rhythm';
            else if (cell === CELL.SIMON  && !pSolved)     cls += ' cell-simon';
            else if (CELL_IS_PUZZLE(cell) && pSolved)       cls += ' cell-puzzle-solved';
            else                                            cls += visited ? ' cell-visited' : ' cell-path';
            if (isPlayer) cls += ' cell-player';

            return (
              <div
                key={`${cx}-${ry}`}
                className={cls}
                onMouseEnter={() => handleCellHover(cell, cx, ry)}
                title={
                  isDanger ? 'DANGER!' :
                  isExit ? 'Exit' :
                  cell === CELL.WORDLE ? 'Word Puzzle' :
                  cell === CELL.CHORD  ? 'Chord Puzzle' :
                  cell === CELL.RHYTHM ? 'Rhythm Puzzle' :
                  cell === CELL.SIMON  ? 'Simon Puzzle' :
                  cell === CELL.WALL   ? 'Wall' : 'Path'
                }
              >
                {isPlayer  && <span className="player-dot">●</span>}
                {isExit && !isPlayer    && <span>🚪</span>}
                {isDanger && !isPlayer  && <span>{isNearD ? '🦖' : '💀'}</span>}
                {cell === CELL.WORDLE && !pSolved && !isPlayer && <span className="puzzle-icon">❓</span>}
                {cell === CELL.CHORD  && !pSolved && !isPlayer && <span className="puzzle-icon">🎹</span>}
                {cell === CELL.RHYTHM && !pSolved && !isPlayer && <span className="puzzle-icon">🥁</span>}
                {cell === CELL.SIMON  && !pSolved && !isPlayer && <span className="puzzle-icon">🎮</span>}
                {CELL_IS_PUZZLE(cell)  && pSolved && !isPlayer && <span className="puzzle-icon solved-check">✓</span>}
              </div>
            );
          })
        )}
      </div>
    );
  }

  const PUZZLE_COMPONENTS = {
    wordle: (
      <AudioWordle audioManager={audioRef.current} onSolve={handlePuzzleSolve} onSkip={handlePuzzleSkip} />
    ),
    chord: (
      <ChordPuzzle audioManager={audioRef.current} onSolve={handlePuzzleSolve} onSkip={handlePuzzleSkip} />
    ),
    rhythm: (
      <RhythmPuzzle audioManager={audioRef.current} onSolve={handlePuzzleSolve} onSkip={handlePuzzleSkip} />
    ),
    simon: (
      <SimonPuzzle audioManager={audioRef.current} onSolve={handlePuzzleSolve} onSkip={handlePuzzleSkip} />
    ),
  };

  return (
    <div className="app">
      {/* Puzzle overlays */}
      {PUZZLE_COMPONENTS[phase]}

      {/* Header */}
      <header className="header">
        <div className="header-title">
          <span className="header-icon">🌀</span>
          <h1>Puzzle Maze</h1>
          {lv && <span className="level-badge">Lvl {lv.id}</span>}
        </div>
        <p className="header-sub">Audio-First Exploration · Ludic Design</p>
      </header>

      <main className="main-layout">
        {/* SPLASH */}
        {screen === 'splash' && (
          <div className="splash-card">
            <div className="splash-icon">🌀</div>
            <h2>Welcome to Puzzle Maze</h2>
            <p className="splash-desc">An audio-first exploration game. Navigate mazes using sound, solve music puzzles, avoid lurking dangers.</p>
            <p className="splash-tip">🎧 Use headphones for the best experience!</p>
            <button className="start-btn" onClick={() => {
              setScreen('level-select');
              const utter = new SpeechSynthesisUtterance(buildInstructions('level-select', 1));
              window.speechSynthesis?.speak(utter);
            }}>
              Choose Level
            </button>
          </div>
        )}

        {/* LEVEL SELECT */}
        {screen === 'level-select' && (
          <div className="level-select">
            <h2>Select Level</h2>
            <div className="level-cards">
              {LEVELS.map((lv, i) => (
                <button
                  key={lv.id}
                  className="level-card"
                  onClick={async () => {
                    audioRef.current = new AudioManager();
                    await startLevel(lv);
                  }}
                >
                  <div className="level-num">Level {lv.id}</div>
                  <div className="level-card-name">{lv.name}</div>
                  <div className="level-card-desc">{lv.description}</div>
                  <div className="level-size">{lv.rows}×{lv.cols} maze</div>
                  <kbd className="level-key">{i + 1}</kbd>
                </button>
              ))}
            </div>
            <button className="quit-btn" onClick={() => setScreen('splash')}>↩ Back</button>
            <p className="splash-tip small">Press <kbd>I</kbd> to hear instructions</p>
          </div>
        )}

        {/* Level select keyboard shortcut */}
        {screen === 'level-select' && (
          <LevelSelectKeys onSelect={(lv) => {
            audioRef.current = new AudioManager();
            startLevel(lv);
          }} />
        )}

        {/* PLAYING */}
        {screen === 'playing' && (
          <>
            {/* Maze */}
            <section className="maze-section" aria-label="Maze grid">
              {renderMaze()}
              <div className="maze-legend">
                <span>●<span>You</span></span>
                <span>🚪<span>Exit</span></span>
                <span>❓<span>Word</span></span>
                <span>🎹<span>Chord</span></span>
                <span>🥁<span>Rhythm</span></span>
                <span>🎮<span>Simon</span></span>
                <span>💀<span>Danger</span></span>
              </div>
            </section>

            {/* Right panel */}
            <section className="info-panel">
              <div className="status-panel">
                {/* Narrator */}
                <div className="narrative-box" aria-live="polite" aria-atomic="true">
                  <p className="narrative-label">🎙️ Narrator</p>
                  <p className="narrative-text">{narrative}</p>
                </div>

                {/* Stats */}
                <div className="stats-row">
                  <div className="stat-card">
                    <span className="stat-label">Position</span>
                    <span className="stat-value">({pos.x},{pos.y})</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Moves</span>
                    <span className="stat-value">{moves}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Exit dist.</span>
                    <span className="stat-value">{exitDist}</span>
                  </div>
                </div>

                <div className="open-paths-card">
                  <div><span className="stat-label">Open paths</span><span className="open-dirs">{openDirs}</span></div>
                  <div><span className="stat-label">Exit →</span><span className="open-dirs" style={{color:'#22c55e'}}>{exitDir}</span></div>
                </div>

                {nearDanger.length > 0 && (
                  <div className="danger-warning" role="alert">
                    <span>🦖</span>
                    <span>Danger to the <strong>{nearDanger.map(d => d.dir).join(' & ')}</strong>!</span>
                  </div>
                )}

                <div className="hud-shortcuts">
                  <span><kbd>↑↓←→</kbd> Move</span>
                  <span><kbd>P</kbd> Ping</span>
                  <span><kbd>I</kbd> Instructions</span>
                  <span><kbd>Esc</kbd> Skip puzzle</span>
                </div>

                <div className="event-log" role="log">
                  <p className="log-label">Event Log</p>
                  {log.map((e, i) => (
                    <p key={i} className={`log-entry ${i === 0 ? 'log-latest' : ''}`}>{e}</p>
                  ))}
                </div>

                <button className="quit-btn" onClick={resetToMenu}>↩ Quit to Menu</button>
              </div>
            </section>
          </>
        )}

        {/* WON */}
        {screen === 'won' && (
          <div className="win-card-full">
            <div className="win-emoji">🏆</div>
            <h2>You Escaped!</h2>
            <p>Level <strong>{lv?.id}</strong> cleared in <strong>{moves}</strong> moves.</p>
            <div className="win-actions">
              <button className="start-btn" onClick={() => { audioRef.current = new AudioManager(); startLevel(lv); }}>
                Play Again
              </button>
              <button className="start-btn level2" onClick={() => setScreen('level-select')}>
                Level Select
              </button>
              <button className="quit-btn mt" onClick={resetToMenu}>Back to Menu</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Helper component for level select keyboard shortcuts
function LevelSelectKeys({ onSelect }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '1') onSelect(LEVELS[0]);
      if (e.key === '2') onSelect(LEVELS[1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelect]);
  return null;
}
